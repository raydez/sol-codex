import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCheckpoint } from '../src/mechanisms/context-compact/checkpoint.mjs';

test('compact formatting preserves critical state', () => {
  const text = formatCheckpoint({ objective: 'Fix bug', modifiedFiles: ['a.ts'], verification: [{ name: 'test', status: 'pass' }], observationHandles: ['obs://s/obs_x'], evidenceHandles: [], unresolvedIssues: ['one'], nextActions: ['review'] });
  assert.match(text, /Fix bug/);
  assert.match(text, /a\.ts/);
  assert.match(text, /test=pass/);
  assert.match(text, /obs:\/\//);
});
