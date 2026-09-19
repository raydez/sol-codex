import fs from 'node:fs/promises';
import path from 'node:path';
import { benchmarkDir, makeRunId, writeRun, readRuns } from './run-store.mjs';
import { readOtlpJsonl, summarizeOtelRecords } from './otel-parser.mjs';
import { VARIANTS } from './variants.mjs';

export async function beginManual({ cwd = process.cwd(), dir = null, taskId, variant, notes = null }) {
  if (!taskId || !variant) throw new Error('begin requires --task and --variant');
  if (!VARIANTS[variant]) throw new Error(`Unknown benchmark variant: ${variant}`);
  const root = benchmarkDir(cwd, dir);
  await fs.mkdir(root, { recursive: true });
  const prior = await readRuns(root);
  const repeat = prior.filter(r => r.taskId === taskId && r.variant === variant).length + 1;
  const active = { id: makeRunId(taskId, variant, repeat), mode: 'desktop', taskId, variant, repeat, notes, cwd: path.resolve(cwd), startedAt: new Date().toISOString() };
  await fs.writeFile(path.join(root, 'active.json'), JSON.stringify(active, null, 2) + '\n');
  return active;
}

export async function endManual({ cwd = process.cwd(), dir = null, success, testPass, notes = null }) {
  const root = benchmarkDir(cwd, dir);
  const activeFile = path.join(root, 'active.json');
  const active = JSON.parse(await fs.readFile(activeFile, 'utf8'));
  const run = { ...active, endedAt: new Date().toISOString(), success: bool(success), testPass: bool(testPass), notes: notes ?? active.notes, telemetry: null, usage: null };
  await writeRun(root, run);
  await fs.unlink(activeFile).catch(() => {});
  return run;
}

export async function ingestManual({ cwd = process.cwd(), dir = null, runId = null, otelFile, conversationId = null }) {
  if (!otelFile) throw new Error('ingest requires --otel <file>');
  const root = benchmarkDir(cwd, dir);
  const runsDir = path.join(root, 'runs');
  let target;
  if (runId) target = path.join(runsDir, `${runId}.json`);
  else {
    const names = (await fs.readdir(runsDir)).filter(x => x.endsWith('.json')).sort();
    if (!names.length) throw new Error('No benchmark runs found');
    target = path.join(runsDir, names.at(-1));
  }
  const run = JSON.parse(await fs.readFile(target, 'utf8'));
  const records = await readOtlpJsonl(path.resolve(otelFile));
  const summary = summarizeOtelRecords(records, { startMs: Date.parse(run.startedAt) - 3000, endMs: Date.parse(run.endedAt) + 3000, conversationId });
  run.telemetry = summary;
  run.usage = summary.usage;
  run.modelTurns = summary.responseCompleted || summary.apiRequests;
  run.toolCalls = summary.toolCalls || summary.toolResults;
  run.model = summary.model;
  run.codexVersion = summary.appVersion;
  run.telemetryWarning = summary.conversations.length > 1 && !conversationId
    ? `Multiple Codex conversations (${summary.conversations.length}) overlapped this time window. Re-run ingest with --conversation-id.`
    : null;
  await fs.writeFile(target, JSON.stringify(run, null, 2) + '\n');
  return run;
}

function bool(v) {
  if (typeof v === 'boolean') return v;
  if (v == null) return null;
  return ['1','true','yes','y','pass','passed'].includes(String(v).toLowerCase());
}
