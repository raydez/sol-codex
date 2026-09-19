import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// This test imports the hook only after isolating SoL-Codex data/config in temp dirs.
test('PostToolUse archives large output and returns recall context', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sol-codex-hook-'));
  const cfgDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sol-codex-cfg-'));
  process.env.SOL_CODEX_DATA_DIR = dir;
  process.env.SOL_CODEX_CONFIG = path.join(cfgDir, 'config.json');
  await fs.writeFile(process.env.SOL_CODEX_CONFIG, JSON.stringify({
    version: 1,
    actionFusion: { enabled: false, autoDetect: true, maxCommands: 1, timeoutMs: 120000, maxOutputBytes: 2000000, rules: [] },
    observationPack: { enabled: true, thresholdBytes: 100, previewChars: 50, retainRecent: 2 },
    evidenceReducer: { enabled: false, thresholdBytes: 20000, maxQuotes: 8, quoteChars: 1200 },
    contextCompact: { enabled: true, maxObjectiveChars: 4000, maxItems: 30 },
    packedCommands: [], storage: { retentionDays: 7 }, metrics: { enabled: true }
  }));
  const { postToolUse } = await import('../src/hooks/index.mjs?' + Date.now());
  const out = await postToolUse({ session_id: 's-hook', cwd: cfgDir, hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_use_id: 't1', tool_response: 'x'.repeat(1000) });
  assert.match(out.hookSpecificOutput.additionalContext, /obs:\/\//);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.rm(cfgDir, { recursive: true, force: true });
  delete process.env.SOL_CODEX_DATA_DIR;
  delete process.env.SOL_CODEX_CONFIG;
});
