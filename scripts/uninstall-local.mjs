#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const target = path.join(os.homedir(), '.codex', 'plugins', 'sol-codex');
const marketplaceFile = path.join(os.homedir(), '.agents', 'plugins', 'marketplace.json');
const codex = process.platform === 'win32' ? 'codex.exe' : 'codex';
spawnSync(codex, ['mcp', 'remove', 'sol_codex'], { stdio: 'ignore' });
try {
  const doc = JSON.parse(await fs.readFile(marketplaceFile, 'utf8'));
  if (Array.isArray(doc.plugins)) {
    doc.plugins = doc.plugins.filter(p => p.name !== 'sol-codex');
    await fs.writeFile(marketplaceFile, JSON.stringify(doc, null, 2) + '\n');
  }
} catch {}
await fs.rm(target, { recursive: true, force: true });
console.log('Removed SoL-Codex plugin files and MCP registration. Archived session data was intentionally left in place.');
