import test from 'node:test';
import assert from 'node:assert/strict';
import { reduceDeterministic } from '../src/mechanisms/evidence-reducer/reducer.mjs';
import { verifyReceipt } from '../src/mechanisms/evidence-reducer/verifier.mjs';

test('receipt quotes verify exactly', () => {
  const source = 'start\nERROR boom\nstack line\nend';
  const r = reduceDeterministic(source, { sourceHandle: 'obs://s/obs_x', exitCode: 1 });
  assert.equal(r.ok, true);
  assert.equal(verifyReceipt(source, r.receipt).ok, true);
  const tampered = { ...r.receipt, quotes: [{ ...r.receipt.quotes[0], text: 'not source' }] };
  assert.equal(verifyReceipt(source, tampered).ok, false);
});

test('secret-looking input refuses reduction', () => {
  const r = reduceDeterministic('token=supersecretvalue12345\nERROR x', { sourceHandle: 'obs://s/obs_x' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'secret-risk');
});
