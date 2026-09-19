import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { parseCodexExecJsonl } from './exec-parser.mjs';
import { variantConfig, VARIANTS } from './variants.mjs';
import { benchmarkDir, makeRunId, writeRun } from './run-store.mjs';
import { latestSessionForCwd } from '../storage/session-store.mjs';
import { metricsReport } from '../metrics/events.mjs';
import { environmentFingerprint, validateFrozenEnvironment } from './fingerprint.mjs';

export async function loadManifest(file) {
  const abs = path.resolve(file);
  const manifest = JSON.parse(await fs.readFile(abs, 'utf8'));
  if (manifest.version !== 1 || !Array.isArray(manifest.tasks)) throw new Error('Benchmark manifest requires version=1 and tasks[]');
  const base = path.dirname(abs);
  for (const task of manifest.tasks) {
    if (!task.id || !task.repo || (!task.prompt && !task.promptFile)) throw new Error('Each task needs id, repo, and prompt or promptFile');
    task.repo = path.resolve(base, task.repo);
    if (task.promptFile) task.prompt = await fs.readFile(path.resolve(base, task.promptFile), 'utf8');
  }
  return manifest;
}

export async function runBenchmark({ manifestFile, variants = ['native','all'], repeats = 1, dir = null, keepWorktrees = false, dryRun = false, validationGrade = false }) {
  const manifestAbs = path.resolve(manifestFile);
  const manifest = await loadManifest(manifestAbs);
  const freezeCheck = validateFrozenEnvironment(manifest, { strict: validationGrade });
  if (validationGrade && !freezeCheck.ok) throw new Error(`Validation-grade manifest failed:\n- ${freezeCheck.errors.join('\n- ')}`);
  const fingerprint = await environmentFingerprint({ manifest, manifestFile: manifestAbs, codexCommand: manifest.codexCommand || 'codex' });
  const configuredOutput = dir ? path.resolve(dir) : (manifest.outputDir ? path.resolve(path.dirname(manifestAbs), manifest.outputDir) : null);
  const root = benchmarkDir(process.cwd(), configuredOutput);
  await fs.mkdir(path.join(root, 'runs'), { recursive: true });
  await fs.mkdir(path.join(root, 'artifacts'), { recursive: true });
  await fs.mkdir(path.join(root, 'worktrees'), { recursive: true });
  await fs.writeFile(path.join(root, 'environment.json'), JSON.stringify({ fingerprint, freezeCheck, validationGrade }, null, 2) + '\n');
  for (const v of variants) if (!VARIANTS[v]) throw new Error(`Unknown variant ${v}`);
  const results = [];
  let ordinal = 0;
  for (let repeat = 1; repeat <= repeats; repeat++) {
    for (const task of manifest.tasks) {
      // Rotate variant order by task/repeat to reduce systematic ordering bias.
      const shift = ordinal++ % variants.length;
      const ordered = [...variants.slice(shift), ...variants.slice(0, shift)];
      for (const variant of ordered) {
        const result = await runOne({ task, variant, repeat, root, manifest, keepWorktrees, dryRun, fingerprint, freezeCheck });
        results.push(result);
      }
    }
  }
  return { root, results };
}

async function runOne({ task, variant, repeat, root, manifest, keepWorktrees, dryRun, fingerprint, freezeCheck }) {
  const runId = makeRunId(task.id, variant, repeat);
  const worktree = path.join(root, 'worktrees', runId);
  const runDir = path.join(root, 'artifacts', runId);
  await fs.mkdir(runDir, { recursive: true });
  const startedAt = new Date().toISOString();
  const t0 = performance.now();
  let revision = task.revision || 'HEAD';
  let sha = null;
  let setup = [];
  let verification = [];
  let codexResult = null;
  let error = null;
  let solMetrics = null;

  try {
    const resolved = await execFile('git', ['-C', task.repo, 'rev-parse', revision], { timeoutMs: 30000 });
    if (resolved.exitCode !== 0) throw new Error(`Unable to resolve revision ${revision}: ${resolved.stderr || resolved.stdout}`);
    sha = resolved.stdout.trim();
    if (!dryRun) {
      const added = await execFile('git', ['-C', task.repo, 'worktree', 'add', '--detach', worktree, sha], { timeoutMs: 120000 });
      if (added.exitCode !== 0) throw new Error(`Unable to create worktree: ${added.stderr || added.stdout}`);
      const existingConfig = await readJsonOptional(path.join(worktree, '.sol-codex.json')) || {};
      const projectConfig = mergeObjects(existingConfig, task.solCodex || manifest.solCodex || {});
      const v = variantConfig(variant, projectConfig);
      if (variant !== 'native') await fs.writeFile(path.join(worktree, '.sol-codex.json'), JSON.stringify(v.config, null, 2) + '\n');

      for (const cmd of task.setup || []) {
        const spec = commandSpec(cmd, manifest.defaults?.setupTimeoutMs || 300000);
        const r = await execFile(spec.command[0], spec.command.slice(1), { cwd: worktree, timeoutMs: spec.timeoutMs, maxOutputBytes: 2_000_000 });
        setup.push({ command: spec.command, exitCode: r.exitCode, durationMs: r.durationMs });
        if (r.exitCode !== 0) throw new Error(`Setup failed: ${spec.command.join(' ')}`);
      }

      const vcfg = variantConfig(variant, projectConfig);
      const pluginKey = await resolvePluginKey(manifest);
      const args = ['exec', '--json', '--ephemeral', '--sandbox', manifest.defaults?.sandbox || 'workspace-write'];
      if (manifest.environment?.model) args.push('--model', String(manifest.environment.model));
      if (manifest.environment?.reasoningEffort) args.push('--config', `model_reasoning_effort="${String(manifest.environment.reasoningEffort)}"`);
      for (const a of manifest.defaults?.codexArgs || []) args.push(String(a));
      for (const a of task.codexArgs || []) args.push(String(a));
      args.push('--config', `plugins."${pluginKey}".enabled=${vcfg.pluginEnabled ? 'true' : 'false'}`);
      if (variant === 'native' && manifest.disableMcpForNative !== false) {
        const mcpServerName = manifest.mcpServerName || 'sol_codex';
        args.push('--config', `mcp_servers.${mcpServerName}.enabled=false`);
      }
      args.push(task.prompt);
      const codex = await execFile(manifest.codexCommand || 'codex', args, {
        cwd: worktree,
        timeoutMs: task.timeoutMs || manifest.defaults?.taskTimeoutMs || 1800000,
        maxOutputBytes: manifest.defaults?.maxCodexOutputBytes || 20_000_000
      });
      await fs.writeFile(path.join(runDir, 'codex.jsonl'), codex.stdout);
      await fs.writeFile(path.join(runDir, 'codex.stderr.log'), codex.stderr);
      codexResult = { exitCode: codex.exitCode, durationMs: codex.durationMs, ...parseCodexExecJsonl(codex.stdout) };

      for (const cmd of task.verify || []) {
        const spec = commandSpec(cmd, manifest.defaults?.verifyTimeoutMs || 180000);
        const r = await execFile(spec.command[0], spec.command.slice(1), { cwd: worktree, timeoutMs: spec.timeoutMs, maxOutputBytes: 5_000_000 });
        verification.push({ command: spec.command, exitCode: r.exitCode, durationMs: r.durationMs, stdoutTail: tail(r.stdout, 4000), stderrTail: tail(r.stderr, 4000) });
      }
      const latest = await latestSessionForCwd(worktree).catch(() => null);
      if (latest?.sessionId) solMetrics = await metricsReport(latest.sessionId).catch(() => null);
      const diff = await execFile('git', ['-C', worktree, 'diff', '--stat'], { timeoutMs: 30000 });
      await fs.writeFile(path.join(runDir, 'diff.stat.txt'), diff.stdout);
      const patch = await execFile('git', ['-C', worktree, 'diff', '--binary'], { timeoutMs: 30000, maxOutputBytes: 20_000_000 });
      await fs.writeFile(path.join(runDir, 'model.patch'), patch.stdout);
    }
  } catch (e) {
    error = String(e?.stack || e);
    await fs.writeFile(path.join(runDir, 'error.log'), error + '\n').catch(() => {});
  } finally {
    if (!dryRun && !keepWorktrees && sha) await execFile('git', ['-C', task.repo, 'worktree', 'remove', '--force', worktree], { timeoutMs: 120000 }).catch(() => {});
  }

  const externalVerificationPending = task.externalVerification === 'swebench';
  const testPass = externalVerificationPending ? null : (verification.length ? verification.every(x => x.exitCode === 0) : (codexResult?.exitCode === 0));
  const success = externalVerificationPending ? null : (!error && codexResult?.exitCode === 0 && testPass);
  const run = {
    id: runId,
    mode: 'cli',
    taskId: task.id,
    variant,
    repeat,
    repo: task.repo,
    revision: sha || revision,
    startedAt,
    endedAt: new Date().toISOString(),
    wallTimeMs: Math.round(performance.now() - t0),
    agentWallTimeMs: codexResult?.durationMs ?? null,
    success,
    testPass,
    externalVerification: task.externalVerification || null,
    externalVerificationPending,
    setup,
    verification,
    error,
    threadId: codexResult?.threadId || null,
    modelTurns: codexResult?.modelTurns || 0,
    toolCalls: codexResult?.toolCalls || 0,
    usage: codexResult?.usage || { inputTokens:0,cachedInputTokens:0,outputTokens:0,reasoningOutputTokens:0,totalTokens:0 },
    codexExitCode: codexResult?.exitCode ?? null,
    solMetrics,
    benchmarkWarning: variant !== 'native' && !solMetrics ? 'No SoL-Codex hook telemetry was detected for this run. Verify the plugin is installed, enabled, and its hooks are trusted before interpreting this variant.' : null,
    environmentFingerprint: fingerprint,
    freezeWarnings: freezeCheck?.warnings || [],
    artifacts: path.relative(root, runDir)
  };
  await writeRun(root, run);
  return run;
}

export async function execFile(command, args = [], { cwd = process.cwd(), timeoutMs = 120000, maxOutputBytes = 5_000_000, env = process.env } = {}) {
  const t0 = performance.now();
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, shell: false, stdio: ['ignore','pipe','pipe'] });
    const out=[]; const err=[]; let outBytes=0; let errBytes=0; let killed=false;
    const timer=setTimeout(()=>{ killed=true; child.kill('SIGTERM'); setTimeout(()=>child.kill('SIGKILL'), 2000).unref(); }, timeoutMs);
    child.stdout.on('data', b=>{ if (outBytes < maxOutputBytes) { out.push(b); outBytes += b.length; } });
    child.stderr.on('data', b=>{ if (errBytes < maxOutputBytes) { err.push(b); errBytes += b.length; } });
    child.once('error', e=>{ clearTimeout(timer); reject(e); });
    child.once('close', code=>{ clearTimeout(timer); resolve({ exitCode: killed ? 124 : (code ?? 1), stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8'), durationMs: Math.round(performance.now()-t0) }); });
  });
}

function commandSpec(cmd, defaultTimeoutMs) {
  if (Array.isArray(cmd)) return { command: cmd.map(String), timeoutMs: defaultTimeoutMs };
  if (cmd && Array.isArray(cmd.command)) return { command: cmd.command.map(String), timeoutMs: Number(cmd.timeoutMs || defaultTimeoutMs) };
  throw new Error('setup/verify commands must be argv arrays or {command:string[], timeoutMs?}');
}

async function readJsonOptional(file) { try { return JSON.parse(await fs.readFile(file,'utf8')); } catch(e) { if(e.code==='ENOENT') return null; throw e; } }
function mergeObjects(a,b) { const out=structuredClone(a||{}); for(const[k,v]of Object.entries(b||{})){ if(v&&typeof v==='object'&&!Array.isArray(v)&&out[k]&&typeof out[k]==='object'&&!Array.isArray(out[k])) out[k]=mergeObjects(out[k],v); else out[k]=structuredClone(v); } return out; }
function tail(s,n){ return String(s||'').slice(-n); }

async function resolvePluginKey(manifest) {
  if (manifest.pluginKey) return manifest.pluginKey;
  if (process.env.SOL_CODEX_PLUGIN_KEY) return process.env.SOL_CODEX_PLUGIN_KEY;
  try {
    const home = process.env.HOME || process.env.USERPROFILE;
    const file = path.join(home, '.agents', 'plugins', 'marketplace.json');
    const doc = JSON.parse(await fs.readFile(file, 'utf8'));
    if (Array.isArray(doc.plugins) && doc.plugins.some(p => p?.name === 'sol-codex') && doc.name) return `sol-codex@${doc.name}`;
  } catch { /* fallback */ }
  return 'sol-codex@sol-codex-local';
}
