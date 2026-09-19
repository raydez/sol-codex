import path from 'node:path';
import crypto from 'node:crypto';
import { sessionDir, defaultDataDir, safeId } from '../runtime/paths.mjs';
import { writeJsonAtomic, readJson } from './atomic-json.mjs';
import { appendJsonl, readJsonl } from './jsonl.mjs';

function makeId() { return `ev_${crypto.randomUUID().replaceAll('-', '')}`; }
function handle(sessionId, id) { return `evidence://${safeId(sessionId)}/${id}`; }

export function parseEvidenceHandle(value) {
  const m = /^evidence:\/\/([^/]+)\/(ev_[A-Za-z0-9]+)$/.exec(String(value));
  if (!m) throw new Error('Invalid evidence handle');
  return { sessionId: m[1], id: m[2] };
}

export async function putReceipt(sessionId, receipt, dataDir = defaultDataDir()) {
  const id = makeId();
  const dir = path.join(sessionDir(sessionId, dataDir), 'evidence');
  const record = { id, handle: handle(sessionId, id), sessionId: safeId(sessionId), createdAt: new Date().toISOString(), ...receipt };
  await writeJsonAtomic(path.join(dir, `${id}.json`), record);
  await appendJsonl(path.join(dir, 'ledger.jsonl'), { id, handle: record.handle, sourceHandle: record.sourceHandle, verified: record.verified, createdAt: record.createdAt });
  return record;
}

export async function getReceipt(handleValue, dataDir = defaultDataDir()) {
  const { sessionId, id } = parseEvidenceHandle(handleValue);
  const record = await readJson(path.join(sessionDir(sessionId, dataDir), 'evidence', `${id}.json`), null);
  if (!record) throw new Error(`Evidence receipt not found: ${handleValue}`);
  return record;
}
