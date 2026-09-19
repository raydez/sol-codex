import path from 'node:path';
import { normalizeHookInput } from '../runtime/hook-io.mjs';
import { loadConfig } from '../config/load.mjs';
import { ensureSession, updateSession, readSession } from '../storage/session-store.mjs';
import { putObservation } from '../storage/observation-store.mjs';
import { putReceipt } from '../storage/evidence-store.mjs';
import { metric, metricsReport } from '../metrics/events.mjs';
import { extractPatchedFiles } from '../mechanisms/action-fusion/detector.mjs';
import { planValidation } from '../mechanisms/action-fusion/policy.mjs';
import { runCommand } from '../mechanisms/action-fusion/runner.mjs';
import { reduceDeterministic } from '../mechanisms/evidence-reducer/reducer.mjs';
import { verifyReceipt } from '../mechanisms/evidence-reducer/verifier.mjs';
import { saveCheckpoint, loadCheckpoint, formatCheckpoint } from '../mechanisms/context-compact/checkpoint.mjs';

function serializeToolResponse(response) {
  if (response === undefined || response === null) return '';
  if (typeof response === 'string') return response;
  try { return JSON.stringify(response, null, 2); } catch { return String(response); }
}

function postContext(text) {
  if (!text) return undefined;
  return { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: text } };
}

async function maybeReceipt({ source, sourceHandle, sessionId, exitCode, cfg }) {
  if (!cfg.evidenceReducer.enabled || Buffer.byteLength(source, 'utf8') < cfg.evidenceReducer.thresholdBytes) return null;
  const reduced = reduceDeterministic(source, {
    sourceHandle,
    exitCode,
    maxQuotes: cfg.evidenceReducer.maxQuotes,
    quoteChars: cfg.evidenceReducer.quoteChars
  });
  if (!reduced.ok) {
    await metric(sessionId, 'reducer_fallback', { reason: reduced.reason });
    return null;
  }
  const verified = verifyReceipt(source, reduced.receipt);
  if (!verified.ok) {
    await metric(sessionId, 'reducer_fallback', { reason: verified.reason });
    return null;
  }
  reduced.receipt.verified = true;
  const stored = await putReceipt(sessionId, reduced.receipt);
  await metric(sessionId, 'reducer_receipt', { handle: stored.handle, sourceBytes: Buffer.byteLength(source, 'utf8'), receiptBytes: Buffer.byteLength(JSON.stringify(stored), 'utf8') });
  await updateSession(sessionId, null, s => { s.evidenceHandles = pushUnique(s.evidenceHandles, stored.handle, 30); return s; });
  return stored;
}

function pushUnique(arr = [], item, max = 30) {
  const next = arr.filter(x => x !== item);
  next.push(item);
  return next.slice(-max);
}

export async function sessionStart(input) {
  const e = normalizeHookInput(input);
  await ensureSession(e.sessionId, e.cwd);
  await metric(e.sessionId, 'session_start', { source: e.source, model: e.model });
  if (e.source === 'compact') {
    const cfg = await loadConfig(e.cwd);
    if (cfg.contextCompact.enabled) {
      const checkpoint = await loadCheckpoint(e.sessionId);
      const context = formatCheckpoint(checkpoint);
      if (context) return { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } };
    }
  }
  return undefined;
}

export async function userPromptSubmit(input) {
  const e = normalizeHookInput(input);
  const cfg = await loadConfig(e.cwd);
  await updateSession(e.sessionId, e.cwd, s => {
    if (e.prompt) s.objective = String(e.prompt).slice(0, cfg.contextCompact.maxObjectiveChars);
    return s;
  });
  await metric(e.sessionId, 'user_prompt', { chars: e.prompt ? String(e.prompt).length : 0 });
  return undefined;
}

export async function preToolUse(input) {
  const e = normalizeHookInput(input);
  await ensureSession(e.sessionId, e.cwd);
  await metric(e.sessionId, 'tool_pre', { tool: e.toolName, toolUseId: e.toolUseId });
  return undefined;
}

export async function postToolUse(input) {
  const e = normalizeHookInput(input);
  const cfg = await loadConfig(e.cwd);
  await ensureSession(e.sessionId, e.cwd);
  const notes = [];
  const source = serializeToolResponse(e.toolResponse);

  let observation = null;
  if (cfg.observationPack.enabled && Buffer.byteLength(source, 'utf8') >= cfg.observationPack.thresholdBytes) {
    observation = await putObservation({
      sessionId: e.sessionId,
      tool: e.toolName,
      toolUseId: e.toolUseId,
      content: source,
      previewChars: cfg.observationPack.previewChars
    });
    await metric(e.sessionId, 'observation_archived', { handle: observation.handle, bytes: observation.bytes, tool: e.toolName });
    await updateSession(e.sessionId, e.cwd, s => { s.observationHandles = pushUnique(s.observationHandles, observation.handle, 30); return s; });
    notes.push(`Large ${e.toolName || 'tool'} output archived locally as ${observation.handle} (${observation.bytes} bytes). Use SoL-Codex MCP exact-recall tools if exact source is needed.`);
    const receipt = await maybeReceipt({ source, sourceHandle: observation.handle, sessionId: e.sessionId, exitCode: null, cfg });
    if (receipt) notes.push(`Verified deterministic evidence receipt: ${receipt.handle}.`);
  }

  const changedFiles = extractPatchedFiles(e.toolName, e.toolInput);
  if (changedFiles.length) {
    await updateSession(e.sessionId, e.cwd, s => { for (const f of changedFiles) s.modifiedFiles = pushUnique(s.modifiedFiles, f, 50); return s; });
    if (cfg.actionFusion.enabled) {
      const plan = await planValidation(e.cwd, changedFiles, cfg);
      for (const item of plan) {
        const result = await runCommand(item.command, { cwd: e.cwd, timeoutMs: item.timeoutMs || cfg.actionFusion.timeoutMs, maxOutputBytes: cfg.actionFusion.maxOutputBytes });
        const packed = await putObservation({ sessionId: e.sessionId, tool: 'SoL-Codex ActionFusion', toolUseId: e.toolUseId, content: result.output, previewChars: cfg.observationPack.previewChars });
        await metric(e.sessionId, 'action_fused', { command: item.command, exitCode: result.exitCode, handle: packed.handle });
        await updateSession(e.sessionId, e.cwd, s => {
          s.observationHandles = pushUnique(s.observationHandles, packed.handle, 30);
          s.verification = [...(s.verification || []).filter(v => v.name !== item.name), { name: item.name, status: result.exitCode === 0 ? 'pass' : 'fail', handle: packed.handle, at: new Date().toISOString() }].slice(-20);
          return s;
        });
        const receipt = await maybeReceipt({ source: result.output, sourceHandle: packed.handle, sessionId: e.sessionId, exitCode: result.exitCode, cfg });
        notes.push(`Action Fusion ran ${item.command.join(' ')}: ${result.exitCode === 0 ? 'PASS' : 'FAIL'}; exact output ${packed.handle}${receipt ? `; receipt ${receipt.handle}` : ''}.`);
      }
    }
  }

  await metric(e.sessionId, 'tool_post', { tool: e.toolName, toolUseId: e.toolUseId, responseBytes: Buffer.byteLength(source, 'utf8') });
  return postContext(notes.join('\n'));
}

export async function preCompact(input) {
  const e = normalizeHookInput(input);
  const cfg = await loadConfig(e.cwd);
  if (!cfg.contextCompact.enabled) return undefined;
  const state = await readSession(e.sessionId);
  if (!state) return undefined;
  await saveCheckpoint(e.sessionId, state, e.trigger);
  await metric(e.sessionId, 'compact_checkpoint', { trigger: e.trigger });
  return undefined;
}

export async function postCompact(input) {
  const e = normalizeHookInput(input);
  await metric(e.sessionId, 'compact_post', { trigger: e.trigger });
  return undefined;
}

export async function stopHook(input) {
  const e = normalizeHookInput(input);
  const report = await metricsReport(e.sessionId);
  await metric(e.sessionId, 'session_stop', { summary: report });
  return undefined;
}
