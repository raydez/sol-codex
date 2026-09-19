import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { appendJsonl, readJsonl } from './jsonl.mjs';
import { sessionDir, defaultDataDir, safeId } from '../runtime/paths.mjs';

function makeId() { return `obs_${crypto.randomUUID().replaceAll('-', '')}`; }
function handle(sessionId, id) { return `obs://${safeId(sessionId)}/${id}`; }

export function parseObservationHandle(value) {
  const m = /^obs:\/\/([^/]+)\/(obs_[A-Za-z0-9]+)$/.exec(String(value));
  if (!m) throw new Error('Invalid observation handle');
  return { sessionId: m[1], id: m[2] };
}

function serialize(content) {
  if (typeof content === 'string') return content;
  if (Buffer.isBuffer(content)) return content.toString('utf8');
  try { return JSON.stringify(content, null, 2); }
  catch { return String(content); }
}

export async function putObservation({ sessionId, tool = null, toolUseId = null, content, contentType = 'text/plain', previewChars = 1200 }, dataDir = defaultDataDir()) {
  const text = serialize(content);
  const id = makeId();
  const dir = path.join(sessionDir(sessionId, dataDir), 'observations');
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, `${id}.txt`);
  await fs.writeFile(file, text, { mode: 0o600 });
  const record = {
    id,
    handle: handle(sessionId, id),
    sessionId: safeId(sessionId),
    tool,
    toolUseId,
    contentType,
    chars: text.length,
    bytes: Buffer.byteLength(text, 'utf8'),
    sha256: crypto.createHash('sha256').update(text, 'utf8').digest('hex'),
    preview: text.slice(0, previewChars),
    createdAt: new Date().toISOString()
  };
  await appendJsonl(path.join(dir, 'ledger.jsonl'), record);
  return record;
}

export async function getObservation(handleValue, dataDir = defaultDataDir()) {
  const { sessionId, id } = parseObservationHandle(handleValue);
  const dir = path.join(sessionDir(sessionId, dataDir), 'observations');
  const records = await readJsonl(path.join(dir, 'ledger.jsonl'));
  const record = records.find(x => x.id === id);
  if (!record) throw new Error(`Observation not found: ${handleValue}`);
  return record;
}

export async function readObservation(handleValue, { offset = 0, limit = 12000 } = {}, dataDir = defaultDataDir()) {
  const { sessionId, id } = parseObservationHandle(handleValue);
  const record = await getObservation(handleValue, dataDir);
  const file = path.join(sessionDir(sessionId, dataDir), 'observations', `${id}.txt`);
  const text = await fs.readFile(file, 'utf8');
  const start = Math.max(0, Number(offset) || 0);
  const size = Math.min(100000, Math.max(1, Number(limit) || 12000));
  return { record, offset: start, text: text.slice(start, start + size), totalChars: text.length };
}

export async function searchObservation(handleValue, query, { maxMatches = 20, caseSensitive = false } = {}, dataDir = defaultDataDir()) {
  const { sessionId, id } = parseObservationHandle(handleValue);
  await getObservation(handleValue, dataDir);
  const file = path.join(sessionDir(sessionId, dataDir), 'observations', `${id}.txt`);
  const text = await fs.readFile(file, 'utf8');
  const needle = caseSensitive ? String(query) : String(query).toLowerCase();
  const haystack = caseSensitive ? text : text.toLowerCase();
  const matches = [];
  let cursor = 0;
  while (matches.length < Math.min(100, maxMatches)) {
    const index = haystack.indexOf(needle, cursor);
    if (index < 0) break;
    matches.push({ index, excerpt: text.slice(Math.max(0, index - 180), Math.min(text.length, index + String(query).length + 300)) });
    cursor = index + Math.max(1, needle.length);
  }
  return { handle: handleValue, query: String(query), matches };
}
