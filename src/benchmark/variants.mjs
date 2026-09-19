const base = {
  version: 1,
  actionFusion: { enabled: false, autoDetect: true, maxCommands: 1, timeoutMs: 120000, maxOutputBytes: 2000000, rules: [] },
  observationPack: { enabled: false, thresholdBytes: 10240, previewChars: 1200, retainRecent: 2 },
  evidenceReducer: { enabled: false, thresholdBytes: 20000, maxQuotes: 8, quoteChars: 1200 },
  contextCompact: { enabled: false, maxObjectiveChars: 4000, maxItems: 30 },
  packedCommands: [],
  storage: { retentionDays: 7 },
  metrics: { enabled: true }
};

export const VARIANTS = Object.freeze({
  native: { pluginEnabled: false, config: structuredClone(base) },
  'plugin-off': { pluginEnabled: true, config: structuredClone(base) },
  observation: { pluginEnabled: true, config: { ...structuredClone(base), observationPack: { ...base.observationPack, enabled: true } } },
  action: { pluginEnabled: true, config: { ...structuredClone(base), actionFusion: { ...base.actionFusion, enabled: true } } },
  reducer: { pluginEnabled: true, config: { ...structuredClone(base), observationPack: { ...base.observationPack, enabled: true }, evidenceReducer: { ...base.evidenceReducer, enabled: true } } },
  compact: { pluginEnabled: true, config: { ...structuredClone(base), contextCompact: { ...base.contextCompact, enabled: true } } },
  all: { pluginEnabled: true, config: { ...structuredClone(base), actionFusion: { ...base.actionFusion, enabled: true }, observationPack: { ...base.observationPack, enabled: true }, evidenceReducer: { ...base.evidenceReducer, enabled: true }, contextCompact: { ...base.contextCompact, enabled: true } } }
});

export function variantConfig(name, projectConfig = {}) {
  const v = VARIANTS[name];
  if (!v) throw new Error(`Unknown benchmark variant: ${name}`);
  const cfg = structuredClone(v.config);
  // Preserve task-specific safe packed commands and optional thresholds without allowing task manifest to switch mechanism identity.
  if (Array.isArray(projectConfig.packedCommands)) cfg.packedCommands = structuredClone(projectConfig.packedCommands);
  for (const key of ['actionFusion', 'observationPack', 'evidenceReducer', 'contextCompact']) {
    if (projectConfig[key] && typeof projectConfig[key] === 'object') {
      const enabled = cfg[key].enabled;
      Object.assign(cfg[key], projectConfig[key]);
      cfg[key].enabled = enabled;
    }
  }
  return { pluginEnabled: v.pluginEnabled, config: cfg };
}
