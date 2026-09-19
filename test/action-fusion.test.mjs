import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPatchedFiles } from '../src/mechanisms/action-fusion/detector.mjs';
import { isSafeCommandArray } from '../src/mechanisms/action-fusion/policy.mjs';

test('extractPatchedFiles parses apply_patch paths', () => {
  const command = '*** Begin Patch\n*** Update File: src/a.ts\n*** Add File: src/b.ts\n*** End Patch';
  assert.deepEqual(extractPatchedFiles('apply_patch', { command }), ['src/a.ts', 'src/b.ts']);
});

test('dangerous command basename is rejected', () => {
  assert.equal(isSafeCommandArray(['rm', '-rf', '/']), false);
  assert.equal(isSafeCommandArray(['npm', 'test']), true);
});

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveNamedCommand } from '../src/mechanisms/action-fusion/policy.mjs';
import { DEFAULT_CONFIG } from '../src/config/defaults.mjs';

test('auto-detected packed command requires explicit Action Fusion opt-in', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sol-codex-policy-'));
  await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }));
  const off = structuredClone(DEFAULT_CONFIG);
  assert.equal(await resolveNamedCommand(dir, 'test', off), null);
  const on = structuredClone(DEFAULT_CONFIG);
  on.actionFusion.enabled = true;
  assert.ok(await resolveNamedCommand(dir, 'test', on));
  await fs.rm(dir, { recursive: true, force: true });
});
