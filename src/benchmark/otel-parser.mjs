import fs from 'node:fs/promises';

function anyValue(v) {
  if (v == null) return null;
  if (typeof v !== 'object') return v;
  if ('stringValue' in v) return v.stringValue;
  if ('intValue' in v) return Number(v.intValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('boolValue' in v) return Boolean(v.boolValue);
  if ('bytesValue' in v) return v.bytesValue;
  if (v.arrayValue?.values) return v.arrayValue.values.map(anyValue);
  if (v.kvlistValue?.values) return Object.fromEntries(v.kvlistValue.values.map(x => [x.key, anyValue(x.value)]));
  return v;
}

function attrs(list = []) {
  const out = {};
  for (const x of list || []) if (x?.key) out[x.key] = anyValue(x.value);
  return out;
}

function bodyValue(body) {
  const v = anyValue(body);
  if (typeof v === 'string') {
    const s = v.trim();
    if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
      try { return JSON.parse(s); } catch { /* keep string */ }
    }
  }
  return v;
}

function tsMs(record, receivedAt) {
  for (const key of ['timeUnixNano', 'observedTimeUnixNano']) {
    const raw = record?.[key];
    if (raw !== undefined && raw !== null) {
      try { return Number(BigInt(String(raw)) / 1000000n); } catch { /* ignore */ }
    }
  }
  const t = Date.parse(receivedAt || '');
  return Number.isFinite(t) ? t : Date.now();
}

function flattenObject(obj, prefix = '', out = {}) {
  if (obj == null) return out;
  if (typeof obj !== 'object' || Array.isArray(obj)) {
    if (prefix) out[prefix] = obj;
    return out;
  }
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flattenObject(v, p, out);
    else out[p] = v;
  }
  return out;
}

function numberByAliases(map, aliases) {
  const normalized = new Map(Object.entries(map).map(([k, v]) => [k.toLowerCase().replace(/[^a-z0-9]/g, ''), v]));
  for (const alias of aliases) {
    const key = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalized.has(key)) {
      const n = Number(normalized.get(key));
      if (Number.isFinite(n)) return n;
    }
    for (const [nk, value] of normalized) {
      if (nk.endsWith(key)) {
        const n = Number(value);
        if (Number.isFinite(n)) return n;
      }
    }
  }
  return 0;
}

export function normalizeOtlpEnvelope(envelope, receivedAt = null) {
  const payload = envelope?.payload ?? envelope;
  const fallbackReceivedAt = envelope?.receivedAt ?? receivedAt;
  const records = [];
  for (const resourceLogs of payload?.resourceLogs || []) {
    const resourceAttrs = attrs(resourceLogs?.resource?.attributes);
    for (const scopeLogs of resourceLogs?.scopeLogs || []) {
      const scopeAttrs = attrs(scopeLogs?.scope?.attributes);
      for (const log of scopeLogs?.logRecords || []) {
        const logAttrs = attrs(log.attributes);
        const body = bodyValue(log.body);
        const bodyFlat = body && typeof body === 'object' ? flattenObject(body) : {};
        const merged = { ...resourceAttrs, ...scopeAttrs, ...logAttrs, ...bodyFlat };
        const bodyText = typeof body === 'string' ? body : null;
        const eventName = String(
          merged['event.name'] ?? merged.event_name ?? merged.name ?? merged.event ?? bodyText ?? ''
        );
        records.push({
          timestampMs: tsMs(log, fallbackReceivedAt),
          eventName,
          body,
          attributes: merged,
          conversationId: merged['conversation.id'] ?? merged.conversation_id ?? merged['thread.id'] ?? merged.thread_id ?? null,
          model: merged.model ?? merged['gen_ai.request.model'] ?? null,
          appVersion: merged['app.version'] ?? merged.app_version ?? null
        });
      }
    }
  }
  return records;
}

export async function readOtlpJsonl(file) {
  const text = await fs.readFile(file, 'utf8');
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { out.push(...normalizeOtlpEnvelope(JSON.parse(line))); } catch { /* tolerate partial lines */ }
  }
  return out;
}

export function summarizeOtelRecords(records, { startMs = -Infinity, endMs = Infinity, conversationId = null } = {}) {
  const filtered = (records || []).filter(r => r.timestampMs >= startMs && r.timestampMs <= endMs && (!conversationId || r.conversationId === conversationId));
  const conversations = [...new Set(filtered.map(x => x.conversationId).filter(Boolean))];
  const out = {
    records: filtered.length,
    conversations,
    model: filtered.find(x => x.model)?.model || null,
    appVersion: filtered.find(x => x.appVersion)?.appVersion || null,
    apiRequests: 0,
    responseCompleted: 0,
    toolCalls: 0,
    toolResults: 0,
    compactCount: 0,
    hookRuns: 0,
    usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0, totalTokens: 0 }
  };
  for (const r of filtered) {
    const n = r.eventName;
    const a = r.attributes || {};
    const flat = { ...a };
    if (r.body && typeof r.body === 'object') Object.assign(flat, flattenObject(r.body));
    const kind = String(a.kind ?? a['event.kind'] ?? flat.kind ?? '');
    if (n === 'codex.api_request' || n.endsWith('.api_request')) out.apiRequests++;
    if ((n === 'codex.sse_event' || n.endsWith('.sse_event') || n.includes('websocket_event')) && kind === 'response.completed') out.responseCompleted++;
    if (n === 'codex.tool_result' || n.endsWith('.tool_result')) out.toolResults++;
    if (n === 'codex.tool.call' || n.endsWith('.tool.call')) out.toolCalls++;
    if (n === 'codex.hooks.run' || n.endsWith('.hooks.run')) out.hookRuns++;
    if (n === 'codex.task.compact' || n.endsWith('.task.compact')) out.compactCount++;

    // Token fields are emitted on response.completed. Alias matching makes this resilient to schema spelling changes.
    if (kind === 'response.completed' || n.includes('response.completed') || n === 'codex.sse_event' || n.includes('websocket_event')) {
      out.usage.inputTokens += numberByAliases(flat, ['input_tokens', 'input_token_count', 'inputTokens', 'gen_ai.usage.input_tokens']);
      out.usage.cachedInputTokens += numberByAliases(flat, ['cached_input_tokens', 'cached_input_token_count', 'cachedInputTokens']);
      out.usage.outputTokens += numberByAliases(flat, ['output_tokens', 'output_token_count', 'outputTokens', 'gen_ai.usage.output_tokens']);
      out.usage.reasoningOutputTokens += numberByAliases(flat, ['reasoning_output_tokens', 'reasoning_output_token_count', 'reasoningOutputTokens']);
    }
  }
  out.usage.totalTokens = out.usage.inputTokens + out.usage.outputTokens;
  return out;
}
