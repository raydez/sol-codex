import fs from 'node:fs/promises';
import path from 'node:path';
import { sessionDir, defaultDataDir, workspaceKey } from '../runtime/paths.mjs';
import { readJson, writeJsonAtomic } from './atomic-json.mjs';

function blankState(sessionId, cwd) {
  return {
    sessionId,
    cwd,
    objective: null,
    modifiedFiles: [],
    verification: [],
    observationHandles: [],
    evidenceHandles: [],
    unresolvedIssues: [],
    nextActions: [],
    updatedAt: new Date().toISOString()
  };
}

export async function ensureSession(sessionId, cwd, dataDir = defaultDataDir()) {
  const dir = sessionDir(sessionId, dataDir);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, 'state.json');
  const existing = await readJson(file, null);
  const state = existing || blankState(sessionId, cwd);
  state.cwd = cwd || state.cwd;
  state.updatedAt = new Date().toISOString();
  await writeJsonAtomic(file, state);
  await registerWorkspace(cwd, sessionId, dataDir);
  return state;
}

export async function readSession(sessionId, dataDir = defaultDataDir()) {
  return readJson(path.join(sessionDir(sessionId, dataDir), 'state.json'), null);
}

export async function updateSession(sessionId, cwd, mutate, dataDir = defaultDataDir()) {
  const current = (await readSession(sessionId, dataDir)) || blankState(sessionId, cwd);
  current.cwd = cwd || current.cwd;
  const next = (await mutate(structuredClone(current))) || current;
  next.updatedAt = new Date().toISOString();
  await writeJsonAtomic(path.join(sessionDir(sessionId, dataDir), 'state.json'), next);
  if (cwd) await registerWorkspace(cwd, sessionId, dataDir);
  return next;
}

export async function registerWorkspace(cwd, sessionId, dataDir = defaultDataDir()) {
  if (!cwd) return;
  const file = path.join(dataDir, 'workspaces', `${workspaceKey(cwd)}.json`);
  await writeJsonAtomic(file, { cwd: path.resolve(cwd), sessionId, updatedAt: new Date().toISOString() });
}

export async function latestSessionForCwd(cwd, dataDir = defaultDataDir()) {
  const file = path.join(dataDir, 'workspaces', `${workspaceKey(cwd)}.json`);
  return readJson(file, null);
}
