import test from 'node:test';
import assert from 'node:assert/strict';
import { bootstrapCI, exactTwoSidedSignTest, exactMcNemar } from '../src/benchmark/stats.mjs';

test('bootstrap CI is deterministic and bounded', () => {
  const a=bootstrapCI([0.1,0.2,0.3,0.4],{iterations:1000,seed:7});
  const b=bootstrapCI([0.1,0.2,0.3,0.4],{iterations:1000,seed:7});
  assert.deepEqual(a,b);
  assert.ok(a.low <= a.estimate && a.high >= a.estimate);
});

test('exact sign and McNemar tests operate on paired outcomes', () => {
  const sign=exactTwoSidedSignTest([1,1,1,1,1,-1]);
  assert.equal(sign.n,6);
  assert.ok(sign.pValue > 0 && sign.pValue <= 1);
  const mc=exactMcNemar([
    {native:{success:true},all:{success:true}},
    {native:{success:true},all:{success:false}},
    {native:{success:true},all:{success:false}},
    {native:{success:false},all:{success:true}}
  ]);
  assert.equal(mc.leftOnly,2); assert.equal(mc.rightOnly,1);
});
