import crypto from 'node:crypto';
import { containsLikelySecret } from './secret-filter.mjs';

const SIGNAL = /(error|failed|failure|assert|exception|traceback|panic|fatal|warning|warn|✗|×|not ok)/i;

export function reduceDeterministic(source, { sourceHandle, exitCode = null, maxQuotes = 8, quoteChars = 1200 } = {}) {
  const text = String(source);
  if (containsLikelySecret(text)) return { ok: false, reason: 'secret-risk' };
  const lines = text.split(/\r?\n/);
  const selected = [];
  for (let i = 0; i < lines.length && selected.length < maxQuotes; i++) {
    if (SIGNAL.test(lines[i])) selected.push(i);
  }
  if (!selected.length) {
    const start = Math.max(0, lines.length - Math.min(12, lines.length));
    for (let i = start; i < lines.length && selected.length < maxQuotes; i++) selected.push(i);
  }
  const quotes = [];
  for (const lineIndex of selected) {
    const line = lines[lineIndex];
    const start = findLineOffset(text, lineIndex);
    const clipped = line.slice(0, quoteChars);
    quotes.push({ text: clipped, start, end: start + clipped.length, line: lineIndex + 1 });
  }
  const failed = exitCode !== null ? Number(exitCode) !== 0 : selected.some(i => /(error|failed|failure|exception|panic|fatal|not ok)/i.test(lines[i]));
  const receipt = {
    sourceHandle,
    sourceSha256: crypto.createHash('sha256').update(text, 'utf8').digest('hex'),
    exitCode,
    summary: failed ? 'Diagnostic output contains failure/error signals.' : 'Diagnostic output compacted deterministically.',
    quotes,
    tags: failed ? ['diagnostic', 'failure-signal'] : ['diagnostic'],
    verified: false
  };
  return { ok: true, receipt };
}

function findLineOffset(text, lineIndex) {
  if (lineIndex <= 0) return 0;
  let offset = 0;
  for (let i = 0; i < lineIndex; i++) {
    const next = text.indexOf('\n', offset);
    if (next < 0) return text.length;
    offset = next + 1;
  }
  return offset;
}
