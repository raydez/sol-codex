import test from 'node:test';
import assert from 'node:assert/strict';
import { obsGet, harnessStatus } from '../src/mcp/tools.mjs';

test('MCP tool handlers export', () => {
  assert.equal(typeof obsGet, 'function');
  assert.equal(typeof harnessStatus, 'function');
});
