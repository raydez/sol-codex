#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { defaultDataDir } from '../src/runtime/paths.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(here, '..');
const target = path.join(os.homedir(), '.codex', 'plugins', 'sol-codex');
const marketplaceFile = path.join(os.homedir(), '.agents', 'plugins', 'marketplace.json');

await fs.mkdir(path.dirname(target), { recursive: true });
await fs.rm(target, { recursive: true, force: true });
await copyTree(source, target);

console.log(`Installed plugin files to ${target}`);

await updateMarketplace(marketplaceFile);
console.log(`Updated personal plugin marketplace: ${marketplaceFile}`);

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
if (commandExists(npm)) {
  const linked = spawnSync(npm, ['link', '--ignore-scripts', '--omit=optional'], { cwd: target, stdio: 'ignore' });
  if (linked.status === 0) console.log('Linked sol-codex CLI into the active npm global bin.');
  else console.warn(`Could not globally link the sol-codex CLI. Fallback: node ${path.join(target, 'src', 'cli', 'main.mjs')}`);
} else {
  console.warn(`npm not found; CLI fallback: node ${path.join(target, 'src', 'cli', 'main.mjs')}`);
}

const codex = process.platform === 'win32' ? 'codex.exe' : 'codex';
if (commandExists(codex)) {
  spawnSync(codex, ['mcp', 'remove', 'sol_codex'], { stdio: 'ignore' });
  const server = path.join(target, 'src', 'mcp', 'server.mjs');
  const result = spawnSync(codex, ['mcp', 'add', 'sol_codex', '--env', `SOL_CODEX_DATA_DIR=${defaultDataDir()}`, '--', 'node', server], { stdio: 'inherit' });
  if (result.status !== 0) console.warn('Could not register MCP automatically. See README for manual command.');
  else console.log('Registered local MCP server as sol_codex.');
} else {
  console.warn('Codex CLI not found; MCP registration skipped. See README for manual setup.');
}

console.log('\nNext steps:');
console.log('1. Restart ChatGPT Desktop / Codex.');
console.log('2. Install/enable SoL-Codex from the personal marketplace source.');
console.log('3. Open /hooks and review/trust the SoL-Codex hooks.');
console.log('4. Open /mcp and confirm sol_codex is connected.');

async function copyTree(src, dst) {
  const skip = new Set(['.git', 'node_modules', 'coverage', '.DS_Store']);
  await fs.mkdir(dst, { recursive: true });
  for (const entry of await fs.readdir(src, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const a = path.join(src, entry.name), b = path.join(dst, entry.name);
    if (entry.isDirectory()) await copyTree(a, b);
    else if (entry.isFile()) await fs.copyFile(a, b);
  }
}

async function updateMarketplace(file) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  let doc = { name: 'personal', interface: { displayName: 'Personal Plugins' }, plugins: [] };
  try { doc = JSON.parse(await fs.readFile(file, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (!Array.isArray(doc.plugins)) doc.plugins = [];
  doc.plugins = doc.plugins.filter(p => p.name !== 'sol-codex');
  doc.plugins.push({
    name: 'sol-codex',
    source: { source: 'local', path: './.codex/plugins/sol-codex' },
    policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
    category: 'Developer Tools'
  });
  await fs.writeFile(file, JSON.stringify(doc, null, 2) + '\n');
}

function commandExists(command) {
  const tool = process.platform === 'win32' ? 'where' : 'which';
  return spawnSync(tool, [command], { stdio: 'ignore' }).status === 0;
}
