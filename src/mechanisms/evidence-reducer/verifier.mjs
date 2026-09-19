import crypto from 'node:crypto';

export function verifyReceipt(source, receipt) {
  const text = String(source);
  const hash = crypto.createHash('sha256').update(text, 'utf8').digest('hex');
  if (hash !== receipt.sourceSha256) return { ok: false, reason: 'hash-mismatch' };
  for (const quote of receipt.quotes || []) {
    if (!Number.isInteger(quote.start) || !Number.isInteger(quote.end) || quote.start < 0 || quote.end < quote.start) {
      return { ok: false, reason: 'invalid-quote-range' };
    }
    if (text.slice(quote.start, quote.end) !== quote.text) return { ok: false, reason: 'quote-mismatch' };
  }
  return { ok: true };
}
