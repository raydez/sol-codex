import fs from 'node:fs/promises';
import path from 'node:path';
import { readRuns } from './run-store.mjs';
import { validateVariant } from './validation.mjs';

function mean(xs) { return xs.length ? xs.reduce((a,b) => a+b,0)/xs.length : 0; }
function median(xs) { if (!xs.length) return 0; const a=[...xs].sort((x,y)=>x-y); const m=Math.floor(a.length/2); return a.length%2?a[m]:(a[m-1]+a[m])/2; }
function pct(n) { return `${(n * 100).toFixed(1)}%`; }
function num(n, digits=0) { return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: digits }); }

function runCost(run, pricing) {
  if (!pricing || !run.usage) return null;
  const u = run.usage;
  const input = Number(u.inputTokens || 0);
  const cached = Math.min(input, Number(u.cachedInputTokens || 0));
  const uncached = Math.max(0, input - cached);
  const output = Number(u.outputTokens || 0);
  return uncached * Number(pricing.inputPer1M || 0) / 1e6
    + cached * Number(pricing.cachedInputPer1M ?? pricing.inputPer1M ?? 0) / 1e6
    + output * Number(pricing.outputPer1M || 0) / 1e6;
}

export function aggregateRuns(runs, { baseline = 'native', successTolerance = 0.02, pricing = null } = {}) {
  const groups = new Map();
  for (const run of runs) {
    if (!groups.has(run.variant)) groups.set(run.variant, []);
    groups.get(run.variant).push(run);
  }
  const variants = {};
  for (const [variant, xs] of groups) {
    const successCount = xs.filter(x => x.success === true).length;
    const successes = Math.max(successCount, 1);
    const tokens = xs.reduce((s,x) => s + Number(x.usage?.totalTokens || 0), 0);
    const input = xs.reduce((s,x) => s + Number(x.usage?.inputTokens || 0), 0);
    const cached = xs.reduce((s,x) => s + Number(x.usage?.cachedInputTokens || 0), 0);
    const output = xs.reduce((s,x) => s + Number(x.usage?.outputTokens || 0), 0);
    const modelTurns = xs.reduce((s,x) => s + Number(x.modelTurns || 0), 0);
    const toolCalls = xs.reduce((s,x) => s + Number(x.toolCalls || 0), 0);
    const wallMs = xs.reduce((s,x) => s + Number(x.agentWallTimeMs ?? x.wallTimeMs ?? ((Date.parse(x.endedAt||0)-Date.parse(x.startedAt||0)) || 0)), 0);
    const costs = xs.map(x => runCost(x, pricing)).filter(x => x !== null);
    const totalCost = costs.length ? costs.reduce((a,b)=>a+b,0) : null;
    const sol = {
      archivedBytes: xs.reduce((s,x)=>s+Number(x.solMetrics?.archivedBytes||0),0),
      recalledBytes: xs.reduce((s,x)=>s+Number(x.solMetrics?.recalledBytes||0),0),
      actionFused: xs.reduce((s,x)=>s+Number(x.solMetrics?.actionFused||0),0),
      reducerReceipts: xs.reduce((s,x)=>s+Number(x.solMetrics?.reducerReceipts||0),0),
      reducerFallbacks: xs.reduce((s,x)=>s+Number(x.solMetrics?.reducerFallbacks||0),0),
      reducerSourceBytes: xs.reduce((s,x)=>s+Number(x.solMetrics?.reducerSourceBytes||0),0),
      reducerReceiptBytes: xs.reduce((s,x)=>s+Number(x.solMetrics?.reducerReceiptBytes||0),0),
      compactCheckpoints: xs.reduce((s,x)=>s+Number(x.solMetrics?.compactCheckpoints||0),0),
      packedRuns: xs.reduce((s,x)=>s+Number(x.solMetrics?.packedRuns||0),0),
      packedRawBytes: xs.reduce((s,x)=>s+Number(x.solMetrics?.packedRawBytes||0),0),
      packedPreviewBytes: xs.reduce((s,x)=>s+Number(x.solMetrics?.packedPreviewBytes||0),0)
    };
    sol.reducerCompressionRatio = sol.reducerSourceBytes ? sol.reducerReceiptBytes/sol.reducerSourceBytes : null;
    sol.packedReturnRatio = sol.packedRawBytes ? sol.packedPreviewBytes/sol.packedRawBytes : null;
    variants[variant] = {
      runs: xs.length,
      successCount,
      successRate: xs.length ? successCount/xs.length : 0,
      testPassRate: xs.length ? xs.filter(x => x.testPass === true).length/xs.length : 0,
      totalTokens: tokens,
      inputTokens: input,
      cachedInputTokens: cached,
      outputTokens: output,
      tokensPerSuccess: successCount ? tokens/successCount : null,
      meanTokensPerRun: mean(xs.map(x => Number(x.usage?.totalTokens || 0))),
      medianTokensPerRun: median(xs.map(x => Number(x.usage?.totalTokens || 0))),
      modelTurns,
      modelTurnsPerSuccess: successCount ? modelTurns/successCount : null,
      toolCalls,
      toolCallsPerSuccess: successCount ? toolCalls/successCount : null,
      wallTimeMs: wallMs,
      wallMsPerSuccess: successCount ? wallMs/successCount : null,
      totalCost,
      costPerSuccess: totalCost !== null && successCount ? totalCost/successCount : null,
      sol
    };
  }
  const b = variants[baseline] || null;
  const byKey = new Map();
  for (const run of runs) {
    const key = `${run.taskId || 'task'}::${run.repeat || 1}`;
    if (!byKey.has(key)) byKey.set(key, {});
    byKey.get(key)[run.variant] = run;
  }
  for (const [name, v] of Object.entries(variants)) {
    v.qualityGate = !b || name === baseline ? true : (v.successRate >= b.successRate - successTolerance && v.testPassRate >= b.testPassRate - successTolerance);
    v.tokenSavingPerSuccess = b && name !== baseline && b.tokensPerSuccess && v.tokensPerSuccess !== null ? 1 - v.tokensPerSuccess/b.tokensPerSuccess : null;
    v.turnSavingPerSuccess = b && name !== baseline && b.modelTurnsPerSuccess && v.modelTurnsPerSuccess !== null ? 1 - v.modelTurnsPerSuccess/b.modelTurnsPerSuccess : null;
    v.wallSavingPerSuccess = b && name !== baseline && b.wallMsPerSuccess && v.wallMsPerSuccess !== null ? 1 - v.wallMsPerSuccess/b.wallMsPerSuccess : null;
    v.costSavingPerSuccess = b && name !== baseline && b.costPerSuccess && v.costPerSuccess !== null ? 1 - v.costPerSuccess/b.costPerSuccess : null;
    const tokenSavings=[]; const turnSavings=[]; const wallSavings=[];
    if (name !== baseline) {
      for (const pair of byKey.values()) {
        const br=pair[baseline], vr=pair[name];
        if (!br?.success || !vr?.success) continue;
        const bt=Number(br.usage?.totalTokens||0), vt=Number(vr.usage?.totalTokens||0);
        if (bt>0) tokenSavings.push(1-vt/bt);
        const bm=Number(br.modelTurns||0), vm=Number(vr.modelTurns||0);
        if (bm>0) turnSavings.push(1-vm/bm);
        const bw=Number(br.agentWallTimeMs ?? br.wallTimeMs ?? 0), vw=Number(vr.agentWallTimeMs ?? vr.wallTimeMs ?? 0);
        if (bw>0) wallSavings.push(1-vw/bw);
      }
    }
    v.pairedSuccesses = tokenSavings.length;
    v.pairedTokenSavingMean = tokenSavings.length ? mean(tokenSavings) : null;
    v.pairedTokenSavingMedian = tokenSavings.length ? median(tokenSavings) : null;
    v.pairedTurnSavingMean = turnSavings.length ? mean(turnSavings) : null;
    v.pairedWallSavingMean = wallSavings.length ? mean(wallSavings) : null;
  }
  return { baseline, successTolerance, runCount: runs.length, variants };
}

export async function buildReport({ dir, baseline = 'native', successTolerance = 0.02, pricing = null, validation = {} }) {
  const runs = await readRuns(dir);
  const aggregate = aggregateRuns(runs, { baseline, successTolerance, pricing });
  const validations = {};
  for (const name of Object.keys(aggregate.variants)) {
    if (name === baseline) continue;
    validations[name] = validateVariant(runs, { baseline, variant: name, tolerance: successTolerance, ...validation });
  }
  return { generatedAt: new Date().toISOString(), ...aggregate, validations, runs };
}

export function reportMarkdown(report) {
  const lines = [
    '# SoL-Codex Benchmark Report', '',
    `Generated: ${report.generatedAt}`, '',
    `Baseline: \`${report.baseline}\` · Runs: ${report.runCount} · Quality tolerance: ${pct(report.successTolerance)}`, '',
    '| Variant | Runs | Success | Tokens/success | Token saving | Paired n | Paired token saving | Turns/success | Turn saving | Wall/success | Quality gate |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|:---:|'
  ];
  for (const [name, v] of Object.entries(report.variants)) {
    lines.push(`| ${name} | ${v.runs} | ${pct(v.successRate)} | ${v.tokensPerSuccess == null ? '—' : num(v.tokensPerSuccess)} | ${v.tokenSavingPerSuccess == null ? '—' : pct(v.tokenSavingPerSuccess)} | ${v.pairedSuccesses || 0} | ${v.pairedTokenSavingMean == null ? '—' : pct(v.pairedTokenSavingMean)} | ${v.modelTurnsPerSuccess == null ? '—' : num(v.modelTurnsPerSuccess,2)} | ${v.turnSavingPerSuccess == null ? '—' : pct(v.turnSavingPerSuccess)} | ${v.wallMsPerSuccess == null ? '—' : `${num(v.wallMsPerSuccess/1000,1)}s`} | ${v.qualityGate ? 'PASS' : 'FAIL'} |`);
  }
  if (report.validations && Object.keys(report.validations).length) {
    lines.push('', '## Statistical validation', '', 'A cost-saving claim is supported only when the sample-size gate passes, the 95% quality non-inferiority intervals remain within the configured tolerance, and the 95% paired token-saving interval is above zero.', '', '| Variant | Status | Tasks | Paired-success tasks | Success Δ 95% CI | Test-pass Δ 95% CI | Token saving 95% CI | Sign p |', '|---|---|---:|---:|---:|---:|---:|---:|');
    for (const [name,v] of Object.entries(report.validations)) {
      const ci=x=>x?.estimate==null?'—':`${pct(x.estimate)} [${pct(x.low)}, ${pct(x.high)}]`;
      lines.push(`| ${name} | **${String(v.status).toUpperCase()}** | ${v.distinctComparableTasks} | ${v.pairedSuccessfulTasks} | ${ci(v.successDelta)} | ${ci(v.testPassDelta)} | ${ci(v.pairedTokenSaving)} | ${Number(v.tokenSavingSignTest?.pValue ?? 1).toFixed(4)} |`);
    }
  }

  const hasSol = Object.values(report.variants).some(v => v.sol && (v.sol.archivedBytes || v.sol.actionFused || v.sol.reducerReceipts || v.sol.compactCheckpoints || v.sol.packedRuns));
  if (hasSol) {
    lines.push('', '## SoL-Codex mechanism telemetry', '', '| Variant | Archived | Recalled | Fused | Reducer receipts | Reducer ratio | Compact | Packed runs | Packed return ratio |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|');
    for (const [name,v] of Object.entries(report.variants)) {
      const s=v.sol||{};
      lines.push(`| ${name} | ${num(s.archivedBytes||0)} B | ${num(s.recalledBytes||0)} B | ${s.actionFused||0} | ${s.reducerReceipts||0} | ${s.reducerCompressionRatio==null?'—':pct(s.reducerCompressionRatio)} | ${s.compactCheckpoints||0} | ${s.packedRuns||0} | ${s.packedReturnRatio==null?'—':pct(s.packedReturnRatio)} |`);
    }
  }
  if (Object.values(report.variants).some(v => v.costPerSuccess !== null)) {
    lines.push('', '## Configured cost model', '', '| Variant | Total cost | Cost/success | Saving |', '|---|---:|---:|---:|');
    for (const [name, v] of Object.entries(report.variants)) lines.push(`| ${name} | ${v.totalCost == null ? '—' : `$${v.totalCost.toFixed(4)}`} | ${v.costPerSuccess == null ? '—' : `$${v.costPerSuccess.toFixed(4)}`} | ${v.costSavingPerSuccess == null ? '—' : pct(v.costSavingPerSuccess)} |`);
  }
  const warnings = [...new Set((report.runs || []).flatMap(r => [r.benchmarkWarning, r.telemetryWarning]).filter(Boolean))];
  if (warnings.length) {
    lines.push('', '## Warnings', '');
    for (const warning of warnings) lines.push(`- ${warning}`);
  }
  lines.push('', '## Interpretation', '', '- Treat a savings claim as statistically supported only when the Statistical validation status is `SUPPORTED`; the legacy point-estimate quality gate is descriptive only.', '- `tokensPerSuccess` is total input + output tokens divided by successful runs; cached input is not double-counted.', '- Cost is only shown when you provide explicit pricing. SoL-Codex never hardcodes model prices.', '- Mechanism effects overlap; do not add ablation percentages together.', '');
  return lines.join('\n');
}

export function reportCsv(report) {
  const header = ['variant','runs','success_rate','test_pass_rate','tokens_per_success','token_saving','paired_successes','paired_token_saving_mean','paired_token_saving_median','turns_per_success','turn_saving','wall_ms_per_success','quality_gate','validation_status','success_delta_ci_low','success_delta_ci_high','test_delta_ci_low','test_delta_ci_high','token_saving_ci_low','token_saving_ci_high','cost_per_success','cost_saving'];
  const rows = [header.join(',')];
  for (const [name,v] of Object.entries(report.variants)) { const q=report.validations?.[name]; rows.push([
    name,v.runs,v.successRate,v.testPassRate,v.tokensPerSuccess ?? '',v.tokenSavingPerSuccess ?? '',v.pairedSuccesses ?? 0,v.pairedTokenSavingMean ?? '',v.pairedTokenSavingMedian ?? '',v.modelTurnsPerSuccess ?? '',v.turnSavingPerSuccess ?? '',v.wallMsPerSuccess ?? '',v.qualityGate,q?.status ?? '',q?.successDelta?.low ?? '',q?.successDelta?.high ?? '',q?.testPassDelta?.low ?? '',q?.testPassDelta?.high ?? '',q?.pairedTokenSaving?.low ?? '',q?.pairedTokenSaving?.high ?? '',v.costPerSuccess ?? '',v.costSavingPerSuccess ?? ''
  ].map(csv).join(',')); }
  return rows.join('\n') + '\n';
}
function csv(v) { const s=String(v); return /[",\n]/.test(s) ? `"${s.replaceAll('"','""')}"` : s; }

export async function writeReports({ dir, report }) {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await fs.writeFile(path.join(dir, 'report.md'), reportMarkdown(report));
  await fs.writeFile(path.join(dir, 'report.csv'), reportCsv(report));
}
