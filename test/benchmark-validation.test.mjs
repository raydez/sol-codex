import test from 'node:test';
import assert from 'node:assert/strict';
import { validateVariant } from '../src/benchmark/validation.mjs';

function run(taskId, variant, repeat, { success=true, tokens=1000 }={}) {
  return { taskId, variant, repeat, success, testPass:success, usage:{ totalTokens:tokens, inputTokens:tokens-100, outputTokens:100 } };
}

test('validation supports a reproducible non-inferior token saving across 30 task clusters', () => {
  const runs=[];
  for(let i=0;i<30;i++) for(let r=1;r<=3;r++) {
    runs.push(run(`t${i}`,'native',r,{tokens:1000 + (i%3)*20}));
    runs.push(run(`t${i}`,'all',r,{tokens:700 + (i%3)*15}));
  }
  const v=validateVariant(runs,{minTasks:30,minPairedSuccessfulTasks:20,bootstrapIterations:1000,seed:42});
  assert.equal(v.status,'supported');
  assert.equal(v.qualityCI,true);
  assert.equal(v.tokenSavingPositive95,true);
  assert.ok(v.pairedTokenSaving.low > 0.25);
  assert.ok(v.pairedTokenSaving.high < 0.35);
});

test('validation rejects material quality regression even when tokens are lower', () => {
  const runs=[];
  for(let i=0;i<30;i++) for(let r=1;r<=3;r++) {
    runs.push(run(`t${i}`,'native',r,{tokens:1000}));
    runs.push(run(`t${i}`,'all',r,{tokens:500,success:i>=5}));
  }
  const v=validateVariant(runs,{minTasks:30,minPairedSuccessfulTasks:20,bootstrapIterations:1000,seed:43});
  assert.equal(v.status,'quality-regression');
  assert.equal(v.qualityCI,false);
});

test('validation blocks claims when CLI environment fingerprints differ', () => {
  const runs=[];
  for(let i=0;i<30;i++) {
    const base=run(`t${i}`,'native',1,{tokens:1000});
    const cand=run(`t${i}`,'all',1,{tokens:700});
    base.mode=cand.mode='cli';
    base.environmentFingerprint={codexVersion:'1',solCodexVersion:'0.2.1',model:'m',reasoningEffort:'medium',sandbox:'workspace-write',manifestHash:'a'};
    cand.environmentFingerprint={...base.environmentFingerprint,codexVersion:'2'};
    runs.push(base,cand);
  }
  const v=validateVariant(runs,{minTasks:30,minPairedSuccessfulTasks:20,bootstrapIterations:200,seed:1});
  assert.equal(v.status,'environment-mismatch');
  assert.equal(v.environment.status,'mismatch');
});
