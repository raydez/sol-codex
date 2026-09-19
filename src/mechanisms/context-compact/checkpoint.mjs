import path from 'node:path';
import { sessionDir, defaultDataDir } from '../../runtime/paths.mjs';
import { writeJsonAtomic, readJson } from '../../storage/atomic-json.mjs';

export async function saveCheckpoint(sessionId, state, trigger, dataDir = defaultDataDir()) {
  const checkpoint = {
    sessionId,
    trigger,
    objective: state.objective || null,
    modifiedFiles: (state.modifiedFiles || []).slice(-30),
    verification: (state.verification || []).slice(-20),
    observationHandles: (state.observationHandles || []).slice(-20),
    evidenceHandles: (state.evidenceHandles || []).slice(-20),
    unresolvedIssues: (state.unresolvedIssues || []).slice(-20),
    nextActions: (state.nextActions || []).slice(-20),
    createdAt: new Date().toISOString()
  };
  await writeJsonAtomic(path.join(sessionDir(sessionId, dataDir), 'compact', 'latest.json'), checkpoint);
  return checkpoint;
}

export async function loadCheckpoint(sessionId, dataDir = defaultDataDir()) {
  return readJson(path.join(sessionDir(sessionId, dataDir), 'compact', 'latest.json'), null);
}

export function formatCheckpoint(checkpoint) {
  if (!checkpoint) return null;
  const lines = ['SoL-Codex compact-state restoration:'];
  if (checkpoint.objective) lines.push(`Objective: ${checkpoint.objective}`);
  if (checkpoint.modifiedFiles?.length) lines.push(`Modified files: ${checkpoint.modifiedFiles.join(', ')}`);
  if (checkpoint.verification?.length) lines.push('Verification: ' + checkpoint.verification.map(v => `${v.name}=${v.status}`).join('; '));
  if (checkpoint.observationHandles?.length) lines.push(`Observation handles: ${checkpoint.observationHandles.join(', ')}`);
  if (checkpoint.evidenceHandles?.length) lines.push(`Evidence handles: ${checkpoint.evidenceHandles.join(', ')}`);
  if (checkpoint.unresolvedIssues?.length) lines.push(`Unresolved: ${checkpoint.unresolvedIssues.join(' | ')}`);
  if (checkpoint.nextActions?.length) lines.push(`Next: ${checkpoint.nextActions.join(' | ')}`);
  lines.push('Use MCP exact-recall tools when a handle is needed; do not infer hidden source content.');
  return lines.join('\n');
}
