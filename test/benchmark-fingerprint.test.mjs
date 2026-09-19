import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFrozenEnvironment, stableHash } from '../src/benchmark/fingerprint.mjs';

test('validation-grade manifest requires frozen model, effort, and commit revisions', () => {
  const bad=validateFrozenEnvironment({version:1,tasks:[{id:'x',revision:'HEAD',verify:[]}]},{strict:true});
  assert.equal(bad.ok,false);
  const good=validateFrozenEnvironment({environment:{model:'gpt-x',reasoningEffort:'medium'},tasks:[{id:'x',revision:'0123456789abcdef0123456789abcdef01234567',verify:[['npm','test']]}]},{strict:true});
  assert.equal(good.ok,true);
  assert.equal(stableHash({a:1}),stableHash({a:1}));
});
