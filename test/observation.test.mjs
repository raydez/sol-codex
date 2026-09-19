import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { putObservation, readObservation, searchObservation, getObservation } from '../src/storage/observation-store.mjs';

test('observation archive supports exact recall and search', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sol-codex-test-'));
  const content = 'alpha\nFAILED assertion xyz\nomega';
  const rec = await putObservation({ sessionId: 's1', tool: 'Bash', content }, dir);
  const meta = await getObservation(rec.handle, dir);
  assert.equal(meta.bytes, Buffer.byteLength(content));
  const slice = await readObservation(rec.handle, { offset: 6, limit: 20 }, dir);
  assert.equal(slice.text, content.slice(6, 26));
  const search = await searchObservation(rec.handle, 'FAILED', {}, dir);
  assert.equal(search.matches.length, 1);
  await fs.rm(dir, { recursive: true, force: true });
});
