import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { beginManual, endManual, ingestManual } from '../src/benchmark/manual.mjs';

test('Desktop begin/end/ingest workflow attributes OTLP token usage to a run', async () => {
  const cwd=await fs.mkdtemp(path.join(os.tmpdir(),'sol-codex-manual-'));
  const dir=path.join(cwd,'.bench');
  const active=await beginManual({cwd,dir,taskId:'t1',variant:'native'});
  await new Promise(r=>setTimeout(r,2));
  const run=await endManual({cwd,dir,success:true,testPass:true});
  assert.equal(run.id,active.id);
  const otel=path.join(dir,'otel.jsonl');
  const envelope={receivedAt:new Date().toISOString(),path:'/v1/logs',payload:{resourceLogs:[{resource:{attributes:[{key:'conversation.id',value:{stringValue:'c1'}}]},scopeLogs:[{logRecords:[{body:{stringValue:'codex.sse_event'},attributes:[{key:'kind',value:{stringValue:'response.completed'}},{key:'usage.input_tokens',value:{intValue:'800'}},{key:'usage.output_tokens',value:{intValue:'100'}}]}]}]}]}};
  await fs.writeFile(otel,JSON.stringify(envelope)+'\n');
  const ingested=await ingestManual({cwd,dir,runId:run.id,otelFile:otel});
  assert.equal(ingested.usage.inputTokens,800);
  assert.equal(ingested.usage.outputTokens,100);
  assert.equal(ingested.usage.totalTokens,900);
  assert.equal(ingested.telemetry.conversations[0],'c1');
});
