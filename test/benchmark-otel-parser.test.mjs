import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOtlpEnvelope, summarizeOtelRecords } from '../src/benchmark/otel-parser.mjs';

test('OTLP JSON parser extracts Codex response.completed token fields', () => {
  const env = {
    receivedAt: '2026-09-19T10:00:01Z',
    payload: {
      resourceLogs: [
        {
          resource: {
            attributes: [
              { key: 'conversation.id', value: { stringValue: 'c1' } },
              { key: 'model', value: { stringValue: 'gpt-test' } },
              { key: 'app.version', value: { stringValue: '0.143.0' } }
            ]
          },
          scopeLogs: [
            {
              logRecords: [
                {
                  timeUnixNano: '1789812000000000000',
                  body: { stringValue: 'codex.sse_event' },
                  attributes: [
                    { key: 'kind', value: { stringValue: 'response.completed' } },
                    { key: 'input_token_count', value: { intValue: '1000' } },
                    { key: 'cached_input_token_count', value: { intValue: '600' } },
                    { key: 'output_token_count', value: { intValue: '100' } },
                    { key: 'reasoning_output_token_count', value: { intValue: '40' } }
                  ]
                },
                { timeUnixNano: '1789812001000000000', body: { stringValue: 'codex.api_request' }, attributes: [] },
                { timeUnixNano: '1789812002000000000', body: { stringValue: 'codex.tool_result' }, attributes: [] }
              ]
            }
          ]
        }
      ]
    }
  };
  const records = normalizeOtlpEnvelope(env);
  const r = summarizeOtelRecords(records, { startMs: 0, endMs: Infinity });
  assert.equal(r.conversations[0], 'c1');
  assert.equal(r.responseCompleted, 1);
  assert.equal(r.apiRequests, 1);
  assert.equal(r.toolResults, 1);
  assert.equal(r.usage.inputTokens, 1000);
  assert.equal(r.usage.cachedInputTokens, 600);
  assert.equal(r.usage.outputTokens, 100);
  assert.equal(r.usage.totalTokens, 1100);
});
