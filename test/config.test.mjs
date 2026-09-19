import test from 'node:test';
import assert from 'node:assert/strict';
import { deepMerge } from '../src/config/load.mjs';
import { DEFAULT_CONFIG } from '../src/config/defaults.mjs';

test('deepMerge merges known nested fields', () => {
  const cfg = deepMerge(DEFAULT_CONFIG, { actionFusion: { enabled: true } });
  assert.equal(cfg.actionFusion.enabled, true);
  assert.equal(cfg.actionFusion.autoDetect, true);
});

test('deepMerge rejects unknown fields', () => {
  assert.throws(() => deepMerge(DEFAULT_CONFIG, { nope: true }), /Unknown/);
});
