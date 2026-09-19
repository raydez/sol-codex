import { loadConfig } from '../config/load.mjs';
import { getObservation, readObservation, searchObservation, putObservation, parseObservationHandle } from '../storage/observation-store.mjs';
import { getReceipt } from '../storage/evidence-store.mjs';
import { latestSessionForCwd, readSession, updateSession } from '../storage/session-store.mjs';
import { metricsReport, metric } from '../metrics/events.mjs';
import { resolveNamedCommand, isSafeCommandArray } from '../mechanisms/action-fusion/policy.mjs';
import { runCommand } from '../mechanisms/action-fusion/runner.mjs';
import { reduceDeterministic } from '../mechanisms/evidence-reducer/reducer.mjs';
import { verifyReceipt } from '../mechanisms/evidence-reducer/verifier.mjs';
import { putReceipt } from '../storage/evidence-store.mjs';

function text(value) { return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] }; }

export async function obsGet(args) {
  const record = await getObservation(args.handle);
  const maxChars = Math.max(1, Math.min(20000, args.max_chars ?? 4000));
  const slice = await readObservation(args.handle, { offset: 0, limit: maxChars });
  const sid = parseObservationHandle(args.handle).sessionId;
  await metric(sid, 'observation_recalled', { handle: args.handle, bytes: Buffer.byteLength(slice.text, 'utf8'), mode: 'get' });
  return text({ ...record, content: slice.text, truncated: slice.totalChars > maxChars });
}

export async function obsSlice(args) {
  const result = await readObservation(args.handle, { offset: args.offset ?? 0, limit: args.limit ?? 12000 });
  const sid = parseObservationHandle(args.handle).sessionId;
  await metric(sid, 'observation_recalled', { handle: args.handle, bytes: Buffer.byteLength(result.text, 'utf8'), mode: 'slice' });
  return text({ handle: args.handle, offset: result.offset, totalChars: result.totalChars, content: result.text });
}

export async function obsSearch(args) {
  const result = await searchObservation(args.handle, args.query, { maxMatches: args.max_matches ?? 20, caseSensitive: args.case_sensitive ?? false });
  const sid = parseObservationHandle(args.handle).sessionId;
  await metric(sid, 'observation_recalled', { handle: args.handle, bytes: Buffer.byteLength(JSON.stringify(result), 'utf8'), mode: 'search' });
  return text(result);
}


export async function evidenceGet(args) {
  const receipt = await getReceipt(args.handle);
  return text(receipt);
}

export async function harnessStatus(args) {
  const cwd = args.cwd || process.cwd();
  const latest = await latestSessionForCwd(cwd);
  if (!latest) return text({ cwd, activeSession: null, message: 'No SoL-Codex session recorded for this workspace.' });
  const state = await readSession(latest.sessionId);
  const report = await metricsReport(latest.sessionId);
  const cfg = await loadConfig(cwd);
  return text({ cwd, activeSession: latest.sessionId, mechanisms: {
    actionFusion: cfg.actionFusion.enabled,
    observationPack: cfg.observationPack.enabled,
    evidenceReducer: cfg.evidenceReducer.enabled,
    contextCompact: cfg.contextCompact.enabled
  }, state, metrics: report });
}

export async function runPacked(args) {
  const cwd = args.cwd || process.cwd();
  const cfg = await loadConfig(cwd);
  const named = await resolveNamedCommand(cwd, args.name, cfg);
  if (!named) throw new Error(`Packed command not configured or detected: ${args.name}`);
  if (!isSafeCommandArray(named.command)) throw new Error('Packed command rejected by safety policy');
  const latest = await latestSessionForCwd(cwd);
  const sessionId = args.session_id || latest?.sessionId || `mcp_${Date.now()}`;
  const result = await runCommand(named.command, { cwd, timeoutMs: args.timeout_ms || named.timeoutMs || cfg.actionFusion.timeoutMs, maxOutputBytes: cfg.actionFusion.maxOutputBytes });
  const observation = await putObservation({ sessionId, tool: 'SoL-Codex run_packed', content: result.output, previewChars: cfg.observationPack.previewChars });
  await metric(sessionId, 'run_packed', { name: args.name, command: named.command, exitCode: result.exitCode, handle: observation.handle, rawBytes: Buffer.byteLength(result.output, 'utf8'), previewBytes: Buffer.byteLength(observation.preview || '', 'utf8') });
  let evidence = null;
  if (cfg.evidenceReducer.enabled && Buffer.byteLength(result.output, 'utf8') >= cfg.evidenceReducer.thresholdBytes) {
    const reduced = reduceDeterministic(result.output, { sourceHandle: observation.handle, exitCode: result.exitCode, maxQuotes: cfg.evidenceReducer.maxQuotes, quoteChars: cfg.evidenceReducer.quoteChars });
    if (reduced.ok && verifyReceipt(result.output, reduced.receipt).ok) {
      reduced.receipt.verified = true;
      evidence = await putReceipt(sessionId, reduced.receipt);
      await metric(sessionId, 'reducer_receipt', { handle: evidence.handle, sourceBytes: Buffer.byteLength(result.output, 'utf8'), receiptBytes: Buffer.byteLength(JSON.stringify(evidence), 'utf8') });
    }
  }
  await updateSession(sessionId, cwd, s => {
    s.observationHandles = [...new Set([...(s.observationHandles || []), observation.handle])].slice(-30);
    if (evidence) s.evidenceHandles = [...new Set([...(s.evidenceHandles || []), evidence.handle])].slice(-30);
    s.verification = [...(s.verification || []).filter(v => v.name !== args.name), { name: args.name, status: result.exitCode === 0 ? 'pass' : 'fail', handle: observation.handle, at: new Date().toISOString() }].slice(-20);
    return s;
  });
  return text({ name: args.name, command: named.command, exitCode: result.exitCode, timedOut: result.timedOut, truncated: result.truncated, observation: observation.handle, preview: observation.preview, evidence: evidence?.handle || null });
}
