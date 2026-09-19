#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { defaultDataDir } from '../runtime/paths.mjs';
import { loadConfig } from '../config/load.mjs';
import { detectCommands } from '../mechanisms/action-fusion/project-detector.mjs';
import { latestSessionForCwd } from '../storage/session-store.mjs';
import { metricsReport } from '../metrics/events.mjs';
import { runBenchmark } from '../benchmark/runner.mjs';
import { startCollector, otelToml } from '../benchmark/collector.mjs';
import { beginManual, endManual, ingestManual } from '../benchmark/manual.mjs';
import { benchmarkDir } from '../benchmark/run-store.mjs';
import { buildReport, writeReports, reportMarkdown } from '../benchmark/report.mjs';
import { VARIANTS } from '../benchmark/variants.mjs';
import { validateFrozenEnvironment } from '../benchmark/fingerprint.mjs';
import { loadBuiltinSuite, fetchSWEbenchVerifiedRows } from '../benchmark/suites.mjs';
import { prepareSWEbenchManifest, exportSWEbenchPredictions, importSWEbenchResults } from '../benchmark/swebench.mjs';

const [cmd = 'help', ...args] = process.argv.slice(2);

if (cmd === 'doctor') await doctor(args);
else if (cmd === 'init') await init(args);
else if (cmd === 'report') await report(args);
else if (cmd === 'benchmark') await benchmark(args);
else help();

async function doctor() {
  const cwd = process.cwd();
  const config = await loadConfig(cwd);
  const codex = commandExists('codex');
  const checks = [];
  checks.push(['Node >=22', Number(process.versions.node.split('.')[0]) >= 22, process.versions.node]);
  checks.push(['Codex CLI', codex, codex ? 'found' : 'not found']);
  checks.push(['Data dir', true, defaultDataDir()]);
  checks.push(['Config', true, JSON.stringify({ actionFusion: config.actionFusion.enabled, observationPack: config.observationPack.enabled, evidenceReducer: config.evidenceReducer.enabled, contextCompact: config.contextCompact.enabled })]);
  const detected = await detectCommands(cwd);
  checks.push(['Detected validation', true, detected.map(x => `${x.name}: ${x.command.join(' ')}`).join('; ') || 'none']);
  for (const [name, ok, info] of checks) console.log(`${ok ? 'OK ' : 'ERR'} ${name}: ${info}`);
  process.exitCode = checks.every(x => x[1]) ? 0 : 1;
}

async function init(args) {
  const cwd = process.cwd();
  const file = path.join(cwd, '.sol-codex.json');
  try { await fs.access(file); throw new Error(`${file} already exists`); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const detected = await detectCommands(cwd);
  const enable = args.includes('--action-fusion');
  const config = {
    version: 1,
    actionFusion: { enabled: enable, autoDetect: true, maxCommands: 1, timeoutMs: 120000, maxOutputBytes: 2000000, rules: [] },
    observationPack: { enabled: true, thresholdBytes: 10240, previewChars: 1200, retainRecent: 2 },
    evidenceReducer: { enabled: true, thresholdBytes: 20000, maxQuotes: 8, quoteChars: 1200 },
    contextCompact: { enabled: true, maxObjectiveChars: 4000, maxItems: 30 },
    packedCommands: detected.map(x => ({ name: x.name, command: x.command })),
    storage: { retentionDays: 7 },
    metrics: { enabled: true }
  };
  await fs.writeFile(file, JSON.stringify(config, null, 2) + '\n');
  console.log(`Created ${file}`);
  console.log(`Action Fusion: ${enable ? 'enabled' : 'disabled (use --action-fusion to enable at init time)'}`);
}

async function report(args) {
  const cwd = process.cwd();
  const sessionId = args[0] || (await latestSessionForCwd(cwd))?.sessionId;
  if (!sessionId) throw new Error('No session found for current workspace; pass a session id.');
  console.log(JSON.stringify(await metricsReport(sessionId), null, 2));
}

async function benchmark(args) {
  const [sub = 'help', ...rest] = args;
  const o = parseOptions(rest);
  if (sub === 'doctor') {
    const checks=[];
    const hasCodex=commandExists('codex');
    checks.push(['Codex CLI',hasCodex,hasCodex?'found':'not found (Desktop manual mode can still be used)']);
    if (hasCodex) {
      const h=spawnSync('codex',['exec','--help'],{encoding:'utf8'});
      checks.push(['codex exec --json',String(h.stdout||h.stderr||'').includes('--json'),'required for automated CLI token accounting']);
      const m=spawnSync('codex',['mcp','list'],{encoding:'utf8'});
      checks.push(['sol_codex MCP',String(m.stdout||'').includes('sol_codex'),'run installer if missing']);
    }
    const market=await detectMarketplacePlugin();
    checks.push(['SoL-Codex marketplace',Boolean(market),market||'not found']);
    for(const [name,ok,info] of checks) console.log(`${ok?'OK ':'WARN'} ${name}: ${info}`);
    process.exitCode=checks.some(x=>x[0]==='codex exec --json'&&!x[1])?1:0;
    return;
  }
  if (sub === 'variants') {
    console.log(Object.keys(VARIANTS).join('\n'));
    return;
  }
  if (sub === 'variant-config') {
    const name = o.variant || 'all';
    const v = VARIANTS[name];
    if (!v) throw new Error(`Unknown benchmark variant: ${name}`);
    console.log(JSON.stringify({ variant: name, pluginEnabled: v.pluginEnabled, config: v.config }, null, 2));
    return;
  }
  if (sub === 'init') {
    const target = path.resolve(o.output || 'sol-codex-benchmark.json');
    try { await fs.access(target); throw new Error(`${target} already exists`); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const sample = {
      version: 1,
      outputDir: '.sol-codex-benchmark',
      environment: { model: 'SET_EXACT_CODEX_MODEL', reasoningEffort: 'medium' },
      defaults: { sandbox: 'workspace-write', taskTimeoutMs: 1800000, verifyTimeoutMs: 180000, codexArgs: [] },
      tasks: [{ id: 'task-01', repo: '.', revision: 'PIN_EXACT_COMMIT_SHA', prompt: 'Implement the requested change and verify the relevant tests. Do not change unrelated code.', verify: [["npm","test"]] }]
    };
    await fs.writeFile(target, JSON.stringify(sample, null, 2) + '\n');
    console.log(`Created ${target}`);
    return;
  }
  if (sub === 'run') {
    if (!o.manifest) throw new Error('benchmark run requires --manifest <file>');
    const variants = String(o.variants || 'native,plugin-off,observation,action,reducer,compact,all').split(',').map(x => x.trim()).filter(Boolean);
    const repeats = positiveInt(o.repeats || 1, '--repeats');
    const result = await runBenchmark({ manifestFile: o.manifest, variants, repeats, dir: o.dir, keepWorktrees: flag(o['keep-worktrees']), dryRun: flag(o['dry-run']), validationGrade: flag(o['validation-grade']) });
    console.log(`Benchmark complete: ${result.results.length} runs in ${result.root}`);
    const rep = await buildReport({ dir: result.root, baseline: o.baseline || 'native', successTolerance: Number(o['success-tolerance'] ?? 0.02), pricing: await loadPricing(o.pricing), validation: validationOptions(o) });
    await writeReports({ dir: result.root, report: rep });
    console.log(path.join(result.root, 'report.md'));
    return;
  }
  if (sub === 'validate-manifest') {
    if (!o.manifest) throw new Error('benchmark validate-manifest requires --manifest <file>');
    const doc=JSON.parse(await fs.readFile(path.resolve(o.manifest),'utf8'));
    const result=validateFrozenEnvironment(doc,{strict:true});
    for(const e of result.errors) console.log(`ERROR ${e}`);
    for(const w of result.warnings) console.log(`WARN  ${w}`);
    console.log(result.ok?'PASS validation-grade manifest':'FAIL validation-grade manifest');
    process.exitCode=result.ok?0:2;
    return;
  }
  if (sub === 'validate') {
    const root=benchmarkDir(process.cwd(),o.dir);
    const rep=await buildReport({dir:root,baseline:o.baseline||'native',successTolerance:Number(o['success-tolerance']??0.02),pricing:await loadPricing(o.pricing),validation:validationOptions(o)});
    await writeReports({dir:root,report:rep});
    const target=o.variant||'all'; const v=rep.validations?.[target];
    if(!v) throw new Error(`No validation result for variant ${target}`);
    console.log(reportMarkdown(rep));
    console.error(`Validation status for ${target}: ${String(v.status).toUpperCase()}`);
    process.exitCode=v.status==='supported'?0:(v.status==='quality-regression'?3:2);
    return;
  }
  if (sub === 'suite') {
    const action=o.action || rest.find(x=>!x.startsWith('--')) || 'list';
    const name=o.name || 'swebench-verified-30';
    const suite=await loadBuiltinSuite(name);
    if(action==='list') { console.log(JSON.stringify(suite,null,2)); return; }
    if(action==='fetch') {
      const output=path.resolve(o.output||`${name}.jsonl`);
      const rows=await fetchSWEbenchVerifiedRows({ids:suite.instanceIds,output,dataset:suite.dataset});
      console.log(`Fetched ${rows.length} official ${suite.dataset} rows to ${output}`);
      return;
    }
    if(action==='prepare') {
      const manifest=await prepareSWEbenchManifest({rowsFile:o.rows,reposDir:o['repos-dir'],output:o['manifest-output'],model:o.model,reasoningEffort:o['reasoning-effort']||'medium',sandbox:o.sandbox||'workspace-write'});
      console.log(`Prepared ${manifest.tasks.length} SWE-bench tasks in ${path.resolve(o['manifest-output'])}`);
      console.log('Run Codex inference next, then export predictions and grade them with the official SWE-bench evaluator.');
      return;
    }
    throw new Error(`Unknown benchmark suite action: ${action}`);
  }
  if (sub === 'export-swebench') {
    const root=benchmarkDir(process.cwd(),o.dir);
    const predictions=await exportSWEbenchPredictions({dir:root,variant:o.variant,repeat:positiveInt(o.repeat||1,'--repeat'),output:o.output,modelName:o['model-name']||null});
    console.log(`Exported ${predictions.length} SWE-bench predictions to ${path.resolve(o.output)}`);
    return;
  }
  if (sub === 'import-swebench') {
    const root=benchmarkDir(process.cwd(),o.dir);
    const result=await importSWEbenchResults({dir:root,resultsFile:o.results,variant:o.variant,repeat:positiveInt(o.repeat||1,'--repeat')});
    console.log(JSON.stringify(result,null,2));
    return;
  }
  if (sub === 'collect') {
    const root = benchmarkDir(process.cwd(), o.dir);
    const output = path.resolve(o.output || path.join(root, 'otel.jsonl'));
    const port = positiveInt(o.port || 4318, '--port');
    const host = o.host || '127.0.0.1';
    const server = await startCollector({ host, port, output });
    const actual = server.address();
    console.log(`SoL-Codex OTLP/HTTP JSON collector listening on http://${host}:${actual.port}/v1/logs`);
    console.log(`Writing ${output}`);
    console.log('Press Ctrl-C to stop.');
    await new Promise(resolve => {
      const done = () => server.close(resolve);
      process.once('SIGINT', done);
      process.once('SIGTERM', done);
    });
    return;
  }
  if (sub === 'otel-config') {
    console.log(otelToml({ endpoint: o.endpoint || 'http://127.0.0.1:4318/v1/logs', environment: o.environment || 'sol-codex-benchmark' }));
    console.error('Place this in user-level ~/.codex/config.toml for Desktop. Project-level .codex/config.toml cannot override Codex telemetry routing.');
    return;
  }
  if (sub === 'begin') {
    const run = await beginManual({ dir: o.dir, taskId: o.task, variant: o.variant, notes: o.notes });
    console.log(JSON.stringify(run, null, 2));
    return;
  }
  if (sub === 'end') {
    const run = await endManual({ dir: o.dir, success: o.success, testPass: o['test-pass'], notes: o.notes });
    console.log(JSON.stringify(run, null, 2));
    return;
  }
  if (sub === 'ingest') {
    const run = await ingestManual({ dir: o.dir, runId: o.run, otelFile: o.otel, conversationId: o['conversation-id'] || null });
    console.log(JSON.stringify(run, null, 2));
    return;
  }
  if (sub === 'report') {
    const root = benchmarkDir(process.cwd(), o.dir);
    const rep = await buildReport({ dir: root, baseline: o.baseline || 'native', successTolerance: Number(o['success-tolerance'] ?? 0.02), pricing: await loadPricing(o.pricing), validation: validationOptions(o) });
    await writeReports({ dir: root, report: rep });
    console.log(reportMarkdown(rep));
    console.error(`Reports written to ${root}`);
    return;
  }
  benchmarkHelp();
}

function parseOptions(args) {
  const out = {};
  for (let i=0;i<args.length;i++) {
    const a=args[i];
    if (!a.startsWith('--')) continue;
    const key=a.slice(2);
    const next=args[i+1];
    if (next !== undefined && !next.startsWith('--')) { out[key]=next; i++; }
    else out[key]=true;
  }
  return out;
}
function flag(v){ return v===true || ['1','true','yes','y'].includes(String(v||'').toLowerCase()); }
function positiveInt(v,name){ const n=Number(v); if(!Number.isInteger(n)||n<=0) throw new Error(`${name} must be a positive integer`); return n; }
async function loadPricing(file){ if(!file) return null; return JSON.parse(await fs.readFile(path.resolve(file),'utf8')); }

function validationOptions(o) {
  return {
    bootstrapIterations: positiveInt(o['bootstrap-iterations'] || 5000, '--bootstrap-iterations'),
    minTasks: positiveInt(o['min-tasks'] || 30, '--min-tasks'),
    minPairedSuccessfulTasks: positiveInt(o['min-paired-success-tasks'] || 20, '--min-paired-success-tasks'),
    alpha: Number(o.alpha ?? 0.05),
    seed: Number(o.seed ?? 20260919)
  };
}

async function detectMarketplacePlugin() {
  try {
    const home=process.env.HOME||process.env.USERPROFILE;
    const doc=JSON.parse(await fs.readFile(path.join(home,'.agents','plugins','marketplace.json'),'utf8'));
    if (Array.isArray(doc.plugins)&&doc.plugins.some(p=>p?.name==='sol-codex')) return `sol-codex@${doc.name||'personal'}`;
  } catch {}
  return null;
}

function commandExists(command) {
  const result = spawnSync(process.platform === 'win32' ? 'where' : 'which', [command], { stdio: 'ignore' });
  return result.status === 0;
}

function benchmarkHelp() {
  console.log(`SoL-Codex benchmark\n\nAutomated Codex CLI:\n  benchmark doctor\n  benchmark init [--output file]\n  benchmark variants\n  benchmark variant-config --variant all\n  benchmark run --manifest file [--variants native,all] [--repeats 3] [--dir path] [--pricing pricing.json]\n\nDesktop / interactive:\n  benchmark collect [--port 4318] [--output file]\n  benchmark otel-config\n  benchmark begin --task ID --variant native|all\n  benchmark end --success true --test-pass true\n  benchmark ingest --otel .sol-codex-benchmark/otel.jsonl [--run RUN_ID] [--conversation-id ID]\n\nReports:\n  benchmark report [--dir path] [--baseline native] [--success-tolerance 0.02] [--pricing pricing.json]\n`);
}

function help() {
  console.log(`SoL-Codex CLI\n\nCommands:\n  doctor\n  init [--action-fusion]\n  report [session-id]\n  benchmark <subcommand>\n`);
}
