import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export function benchmarkDir(cwd = process.cwd(), explicit = null) {
  return path.resolve(explicit || path.join(cwd, '.sol-codex-benchmark'));
}

export function makeRunId(taskId, variant, repeat = 1) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const rand = crypto.randomBytes(3).toString('hex');
  return `${stamp}-${safe(taskId)}-${safe(variant)}-r${repeat}-${rand}`;
}

function safe(v) { return String(v).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80); }

export async function writeRun(dir, run) {
  const runs = path.join(dir, 'runs');
  await fs.mkdir(runs, { recursive: true });
  const file = path.join(runs, `${safe(run.id)}.json`);
  await fs.writeFile(file, JSON.stringify(run, null, 2) + '\n');
  return file;
}

export async function readRuns(dir) {
  const runs = path.join(dir, 'runs');
  let names = [];
  try { names = await fs.readdir(runs); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  const out = [];
  for (const name of names.filter(x => x.endsWith('.json')).sort()) {
    try { out.push(JSON.parse(await fs.readFile(path.join(runs, name), 'utf8'))); } catch { /* skip corrupt */ }
  }
  return out;
}
