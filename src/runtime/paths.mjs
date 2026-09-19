import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

export function defaultDataDir() {
  if (process.env.SOL_CODEX_DATA_DIR) return path.resolve(process.env.SOL_CODEX_DATA_DIR);
  if (process.env.XDG_DATA_HOME) return path.join(process.env.XDG_DATA_HOME, 'sol-codex');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'sol-codex');
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) return path.join(process.env.LOCALAPPDATA, 'sol-codex');
  return path.join(os.homedir(), '.local', 'share', 'sol-codex');
}

export function safeId(value) {
  const s = String(value || 'unknown').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 160);
  return s || 'unknown';
}

export function sessionDir(sessionId, dataDir = defaultDataDir()) {
  return path.join(dataDir, 'sessions', safeId(sessionId));
}

export function workspaceKey(cwd) {
  return crypto.createHash('sha256').update(path.resolve(cwd)).digest('hex').slice(0, 24);
}
