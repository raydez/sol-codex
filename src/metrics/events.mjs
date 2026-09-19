import path from 'node:path';
import { sessionDir, defaultDataDir } from '../runtime/paths.mjs';
import { appendJsonl, readJsonl } from '../storage/jsonl.mjs';

export async function metric(sessionId, event, data = {}, dataDir = defaultDataDir()) {
  await appendJsonl(path.join(sessionDir(sessionId, dataDir), 'metrics.jsonl'), {
    ts: new Date().toISOString(), event, ...data
  });
}

export async function metricsReport(sessionId, dataDir = defaultDataDir()) {
  const events = await readJsonl(path.join(sessionDir(sessionId, dataDir), 'metrics.jsonl'));
  const report = {
    sessionId,
    events: events.length,
    observationArchived: 0,
    archivedBytes: 0,
    observationRecallCount: 0,
    recalledBytes: 0,
    nativeToolResponseBytes: 0,
    actionFused: 0,
    reducerReceipts: 0,
    reducerFallbacks: 0,
    reducerSourceBytes: 0,
    reducerReceiptBytes: 0,
    compactCheckpoints: 0,
    packedRuns: 0,
    packedRawBytes: 0,
    packedPreviewBytes: 0
  };
  for (const e of events) {
    if (e.event === 'observation_archived') { report.observationArchived++; report.archivedBytes += e.bytes || 0; }
    if (e.event === 'observation_recalled') { report.observationRecallCount++; report.recalledBytes += e.bytes || 0; }
    if (e.event === 'tool_post') report.nativeToolResponseBytes += e.responseBytes || 0;
    if (e.event === 'action_fused') report.actionFused++;
    if (e.event === 'reducer_receipt') {
      report.reducerReceipts++;
      report.reducerSourceBytes += e.sourceBytes || 0;
      report.reducerReceiptBytes += e.receiptBytes || 0;
    }
    if (e.event === 'reducer_fallback') report.reducerFallbacks++;
    if (e.event === 'compact_checkpoint') report.compactCheckpoints++;
    if (e.event === 'run_packed') {
      report.packedRuns++;
      report.packedRawBytes += e.rawBytes || 0;
      report.packedPreviewBytes += e.previewBytes || 0;
    }
  }
  report.reducerCompressionRatio = report.reducerSourceBytes ? report.reducerReceiptBytes / report.reducerSourceBytes : null;
  report.packedReturnRatio = report.packedRawBytes ? report.packedPreviewBytes / report.packedRawBytes : null;
  return report;
}
