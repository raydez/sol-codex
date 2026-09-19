import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBuiltinSuite } from '../src/benchmark/suites.mjs';

test('built-in SWE-bench Verified validation suite contains 30 fixed instance IDs', async () => {
  const suite=await loadBuiltinSuite('swebench-verified-30');
  assert.equal(suite.instanceIds.length,30);
  assert.equal(new Set(suite.instanceIds).size,30);
  assert.equal(suite.dataset,'SWE-bench/SWE-bench_Verified');
});

import { fetchSWEbenchVerifiedRows } from '../src/benchmark/suites.mjs';

test('suite fetcher filters official dataset rows deterministically', async () => {
  const fakeFetch=async () => ({ ok:true, json:async()=>({ rows:[{row:{instance_id:'a',repo:'x'}},{row:{instance_id:'b',repo:'y'}}] }) });
  const rows=await fetchSWEbenchVerifiedRows({ids:['b','a'],dataset:'fake',fetchFn:fakeFetch});
  assert.deepEqual(rows.map(x=>x.instance_id),['b','a']);
});
