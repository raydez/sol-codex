#!/usr/bin/env node
// Prefer the official MCP SDK v2 when optional dependencies are installed.
// Fall back to a zero-dependency 2025-era stdio server. Current MCP clients
// probe server/discover and fall back to initialize when that probe returns
// Method not found, so the fallback remains interoperable with current Codex.
try {
  const { startSdkServer } = await import('./server-sdk.mjs');
  startSdkServer();
} catch (error) {
  if (error?.code !== 'ERR_MODULE_NOT_FOUND' && !String(error?.message || '').includes('Cannot find package')) {
    console.error('[sol-codex] official MCP SDK unavailable or failed to load; using legacy-compatible fallback:', error?.message || error);
  }
  const { startLegacyServer } = await import('./server-legacy.mjs');
  startLegacyServer();
}
