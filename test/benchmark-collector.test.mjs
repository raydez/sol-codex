import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { startCollector } from '../src/benchmark/collector.mjs';

test('local OTLP JSON collector accepts /v1/logs and persists JSONL', async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sol-codex-otel-'));
  const file=path.join(dir,'otel.jsonl');
  const server=await startCollector({port:0,output:file});
  const port=server.address().port;
  const res=await fetch(`http://127.0.0.1:${port}/v1/logs`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({resourceLogs:[]})});
  assert.equal(res.status,200);
  await new Promise(resolve=>server.close(resolve));
  const line=JSON.parse((await fs.readFile(file,'utf8')).trim());
  assert.equal(line.path,'/v1/logs');
  assert.deepEqual(line.payload,{resourceLogs:[]});
});
