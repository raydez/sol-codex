import fs from 'node:fs/promises';

const TOOL_ITEM_TYPES = new Set([
  'command_execution', 'mcp_tool_call', 'web_search', 'file_change',
  'tool_call', 'computer', 'browser', 'apply_patch'
]);

function toNumber(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function parseCodexExecJsonl(text) {
  const events = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { events.push(JSON.parse(line)); } catch { /* tolerate stderr/noise accidentally redirected */ }
  }
  return summarizeCodexExecEvents(events);
}

export async function parseCodexExecFile(file) {
  return parseCodexExecJsonl(await fs.readFile(file, 'utf8'));
}

export function summarizeCodexExecEvents(events) {
  const out = {
    threadId: null,
    modelTurns: 0,
    failedTurns: 0,
    toolCalls: 0,
    commandExecutions: 0,
    mcpCalls: 0,
    itemCounts: {},
    errors: 0,
    usage: {
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      totalTokens: 0
    }
  };

  for (const e of events || []) {
    if (e?.type === 'thread.started') out.threadId = e.thread_id || e.threadId || out.threadId;
    if (e?.type === 'turn.completed') {
      out.modelTurns++;
      const u = e.usage || {};
      out.usage.inputTokens += toNumber(u.input_tokens ?? u.inputTokens);
      out.usage.cachedInputTokens += toNumber(u.cached_input_tokens ?? u.cachedInputTokens);
      out.usage.outputTokens += toNumber(u.output_tokens ?? u.outputTokens);
      out.usage.reasoningOutputTokens += toNumber(u.reasoning_output_tokens ?? u.reasoningOutputTokens);
    }
    if (e?.type === 'turn.failed') out.failedTurns++;
    if (e?.type === 'error') out.errors++;
    if (e?.type === 'item.started' || e?.type === 'item.completed') {
      const type = e?.item?.type || 'unknown';
      if (e.type === 'item.started') {
        out.itemCounts[type] = (out.itemCounts[type] || 0) + 1;
        if (TOOL_ITEM_TYPES.has(type)) out.toolCalls++;
        if (type === 'command_execution') out.commandExecutions++;
        if (type === 'mcp_tool_call') out.mcpCalls++;
      }
    }
  }
  out.usage.totalTokens = out.usage.inputTokens + out.usage.outputTokens;
  return out;
}
