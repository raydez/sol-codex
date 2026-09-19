import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import { obsGet, obsSlice, obsSearch, evidenceGet, harnessStatus, runPacked } from './tools.mjs';

export function startSdkServer() {
  function createServer() {
    const server = new McpServer(
      { name: 'sol-codex', version: '0.2.1', description: 'Local evidence recall and packed validation tools for SoL-Codex.' },
      { capabilities: { tools: {} }, instructions: 'Use archived evidence as authoritative. Prefer exact recall over guessing from summaries. run_packed only executes configured or conservatively detected project commands.' }
    );
    server.registerTool('obs_get', {
      description: 'Get metadata and the first exact characters of an archived SoL-Codex observation.',
      inputSchema: z.object({ handle: z.string().startsWith('obs://'), max_chars: z.number().int().positive().max(20000).optional() })
    }, obsGet);
    server.registerTool('obs_slice', {
      description: 'Read an exact character slice from an archived observation.',
      inputSchema: z.object({ handle: z.string().startsWith('obs://'), offset: z.number().int().nonnegative().default(0), limit: z.number().int().positive().max(100000).default(12000) })
    }, obsSlice);
    server.registerTool('obs_search', {
      description: 'Search exact text inside an archived observation and return matching excerpts with offsets.',
      inputSchema: z.object({ handle: z.string().startsWith('obs://'), query: z.string().min(1), max_matches: z.number().int().positive().max(100).default(20), case_sensitive: z.boolean().default(false) })
    }, obsSearch);
    server.registerTool('evidence_get', {
      description: 'Get a verified deterministic evidence receipt and its exact source handle.',
      inputSchema: z.object({ handle: z.string().startsWith('evidence://') })
    }, evidenceGet);
    server.registerTool('harness_status', {
      description: 'Show SoL-Codex mechanism status, latest session state, and metrics for a workspace.',
      inputSchema: z.object({ cwd: z.string().optional() })
    }, harnessStatus);
    server.registerTool('run_packed', {
      description: 'Run a named project command that is explicitly configured or conservatively auto-detected, archive full output locally, and return a compact result plus exact-recall handle.',
      inputSchema: z.object({ cwd: z.string(), name: z.string().min(1), session_id: z.string().optional(), timeout_ms: z.number().int().positive().max(600000).optional() })
    }, runPacked);
    return server;
  }
  return serveStdio(createServer, { legacy: 'serve', onerror: error => console.error('[sol-codex:mcp]', error) });
}
