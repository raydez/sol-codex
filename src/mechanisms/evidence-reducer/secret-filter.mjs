const PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /gh[pousr]_[A-Za-z0-9]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/i,
  /\b(?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*[^\s]{8,}/i,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/
];

export function containsLikelySecret(text) {
  return PATTERNS.some(re => re.test(String(text)));
}
