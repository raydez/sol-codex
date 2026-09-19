import readline from 'node:readline';
import { obsGet, obsSlice, obsSearch, evidenceGet, harnessStatus, runPacked } from './tools.mjs';

const SERVER = { name: 'sol-codex', version: '0.2.1' };
const LEGACY_VERSIONS = new Set(['2024-10-07','2024-11-05','2025-03-26','2025-06-18','2025-11-25']);

const TOOL_DEFS = [
  { name:'obs_get', description:'Get metadata and the first exact characters of an archived SoL-Codex observation.', inputSchema:{type:'object',properties:{handle:{type:'string'},max_chars:{type:'integer',minimum:1,maximum:20000}},required:['handle'],additionalProperties:false}, handler:obsGet },
  { name:'obs_slice', description:'Read an exact character slice from an archived observation.', inputSchema:{type:'object',properties:{handle:{type:'string'},offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:100000}},required:['handle'],additionalProperties:false}, handler:obsSlice },
  { name:'obs_search', description:'Search exact text inside an archived observation and return matching excerpts with offsets.', inputSchema:{type:'object',properties:{handle:{type:'string'},query:{type:'string'},max_matches:{type:'integer',minimum:1,maximum:100},case_sensitive:{type:'boolean'}},required:['handle','query'],additionalProperties:false}, handler:obsSearch },
  { name:'evidence_get', description:'Get a verified deterministic evidence receipt and its exact source handle.', inputSchema:{type:'object',properties:{handle:{type:'string'}},required:['handle'],additionalProperties:false}, handler:evidenceGet },
  { name:'harness_status', description:'Show SoL-Codex mechanism status, latest session state, and metrics for a workspace.', inputSchema:{type:'object',properties:{cwd:{type:'string'}},additionalProperties:false}, handler:harnessStatus },
  { name:'run_packed', description:'Run a named configured or conservatively detected command, archive full output locally, and return a compact result.', inputSchema:{type:'object',properties:{cwd:{type:'string'},name:{type:'string'},session_id:{type:'string'},timeout_ms:{type:'integer',minimum:1,maximum:600000}},required:['cwd','name'],additionalProperties:false}, handler:runPacked }
];
const TOOL_MAP = new Map(TOOL_DEFS.map(t => [t.name,t]));

function send(message) { process.stdout.write(JSON.stringify(message) + '\n'); }
function ok(id,result){ send({jsonrpc:'2.0',id,result}); }
function err(id,code,message,data){ send({jsonrpc:'2.0',id,error:{code,message,...(data===undefined?{}:{data})}}); }

async function dispatch(msg) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return;
  const id = msg.id;
  if (msg.method === 'server/discover') { if (id !== undefined) err(id,-32601,'Method not found'); return; }
  if (msg.method === 'initialize') {
    const requested = msg.params?.protocolVersion;
    const protocolVersion = LEGACY_VERSIONS.has(requested) ? requested : '2025-11-25';
    ok(id,{ protocolVersion, capabilities:{tools:{}}, serverInfo:SERVER, instructions:'Use archived evidence as authoritative. Prefer exact recall over summaries. run_packed only executes configured or conservatively detected commands.' });
    return;
  }
  if (msg.method === 'notifications/initialized' || msg.method === 'notifications/cancelled') return;
  if (msg.method === 'ping') { if (id !== undefined) ok(id,{}); return; }
  if (msg.method === 'tools/list') { if (id !== undefined) ok(id,{tools:TOOL_DEFS.map(({handler,...d})=>d)}); return; }
  if (msg.method === 'tools/call') {
    const name = msg.params?.name;
    const tool = TOOL_MAP.get(name);
    if (!tool) { err(id,-32602,`Unknown tool: ${name}`); return; }
    try { ok(id, await tool.handler(msg.params?.arguments || {})); }
    catch (error) { ok(id,{content:[{type:'text',text:`SoL-Codex tool error: ${error.message}`}],isError:true}); }
    return;
  }
  if (msg.method === 'logging/setLevel') { if (id !== undefined) ok(id,{}); return; }
  if (id !== undefined) err(id,-32601,'Method not found');
}

export function startLegacyServer() {
  const rl = readline.createInterface({input:process.stdin,crlfDelay:Infinity});
  rl.on('line', line => {
    const trimmed=line.trim();
    if (!trimmed) return;
    let msg;
    try { msg=JSON.parse(trimmed); } catch { return; }
    void dispatch(msg).catch(error => console.error('[sol-codex:mcp-legacy]',error));
  });
  return rl;
}
