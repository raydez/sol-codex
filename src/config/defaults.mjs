export const DEFAULT_CONFIG = Object.freeze({
  version: 1,
  actionFusion: {
    enabled: false,
    autoDetect: true,
    maxCommands: 1,
    timeoutMs: 120000,
    maxOutputBytes: 2_000_000,
    rules: []
  },
  observationPack: {
    enabled: true,
    thresholdBytes: 10240,
    previewChars: 1200,
    retainRecent: 2
  },
  evidenceReducer: {
    enabled: true,
    thresholdBytes: 20000,
    maxQuotes: 8,
    quoteChars: 1200
  },
  contextCompact: {
    enabled: true,
    maxObjectiveChars: 4000,
    maxItems: 30
  },
  packedCommands: [],
  storage: {
    retentionDays: 7
  },
  metrics: {
    enabled: true
  }
});
