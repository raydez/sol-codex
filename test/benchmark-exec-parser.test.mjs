import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCodexExecJsonl } from '../src/benchmark/exec-parser.mjs';

test('Codex exec JSONL parser sums real turn usage without double counting cached input', () => {
  const text = [
    JSON.stringify({type:'thread.started',thread_id:'t1'}),
    JSON.stringify({type:'turn.started'}),
    JSON.stringify({type:'item.started',item:{type:'command_execution'}}),
    JSON.stringify({type:'item.started',item:{type:'mcp_tool_call'}}),
    JSON.stringify({type:'turn.completed',usage:{input_tokens:1000,cached_input_tokens:600,output_tokens:100,reasoning_output_tokens:40}}),
    JSON.stringify({type:'turn.completed',usage:{input_tokens:500,cached_input_tokens:0,output_tokens:50,reasoning_output_tokens:10}})
  ].join('\n');
  const r = parseCodexExecJsonl(text);
  assert.equal(r.threadId,'t1');
  assert.equal(r.modelTurns,2);
  assert.equal(r.toolCalls,2);
  assert.equal(r.usage.inputTokens,1500);
  assert.equal(r.usage.cachedInputTokens,600);
  assert.equal(r.usage.outputTokens,150);
  assert.equal(r.usage.totalTokens,1650);
});
