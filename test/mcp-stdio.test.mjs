import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('bundled MCP server supports legacy initialize, tools/list, and tools/call', async () => {
  const child = spawn(process.execPath, [path.join(root,'src/mcp/server.mjs')], { cwd: root, stdio:['pipe','pipe','pipe'], env:{...process.env, NODE_PATH:''} });
  const lines=[];
  child.stdout.setEncoding('utf8');
  let buffer='';
  child.stdout.on('data', c => { buffer += c; let i; while((i=buffer.indexOf('\n'))>=0){ lines.push(JSON.parse(buffer.slice(0,i))); buffer=buffer.slice(i+1); } });
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'server/discover',params:{}})+'\n');
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:2,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'test',version:'1'}}})+'\n');
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized',params:{}})+'\n');
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:3,method:'tools/list',params:{}})+'\n');
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'harness_status',arguments:{cwd:root}}})+'\n');
  const deadline=Date.now()+3000;
  while(lines.length<4 && Date.now()<deadline) await new Promise(r=>setTimeout(r,20));
  child.kill();
  assert.equal(lines[0].error.code,-32601);
  assert.equal(lines[1].result.protocolVersion,'2025-11-25');
  assert.ok(lines[2].result.tools.some(t=>t.name==='obs_get'));
  assert.ok(lines[2].result.tools.some(t=>t.name==='run_packed'));
  assert.ok(Array.isArray(lines[3].result.content));
  assert.match(lines[3].result.content[0].text, /activeSession/);
});
