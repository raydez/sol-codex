import test from 'node:test';
import assert from 'node:assert/strict';
import { variantConfig } from '../src/benchmark/variants.mjs';

test('benchmark variants isolate mechanisms and preserve packedCommands', () => {
  const p={packedCommands:[{name:'test',command:['npm','test']}],observationPack:{thresholdBytes:2048}};
  const native=variantConfig('native',p);
  assert.equal(native.pluginEnabled,false);
  const reducer=variantConfig('reducer',p);
  assert.equal(reducer.pluginEnabled,true);
  assert.equal(reducer.config.observationPack.enabled,true);
  assert.equal(reducer.config.evidenceReducer.enabled,true);
  assert.equal(reducer.config.actionFusion.enabled,false);
  assert.equal(reducer.config.observationPack.thresholdBytes,2048);
  assert.deepEqual(reducer.config.packedCommands,p.packedCommands);
});
