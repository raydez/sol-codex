import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { DEFAULT_CONFIG } from './defaults.mjs';

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

export function deepMerge(base, override) {
  if (!isObject(override)) return structuredClone(base);
  const out = structuredClone(base);
  for (const [key, value] of Object.entries(override)) {
    if (!(key in base)) throw new Error(`Unknown SoL-Codex config field: ${key}`);
    if (isObject(value) && isObject(base[key])) out[key] = deepMerge(base[key], value);
    else out[key] = value;
  }
  return out;
}

async function readJsonIfExists(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw new Error(`Invalid config ${file}: ${error.message}`);
  }
}

export function userConfigPath() {
  if (process.env.SOL_CODEX_CONFIG) return process.env.SOL_CODEX_CONFIG;
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, 'sol-codex', 'config.json');
}

export async function loadConfig(cwd = process.cwd()) {
  let cfg = structuredClone(DEFAULT_CONFIG);
  const user = await readJsonIfExists(userConfigPath());
  if (user) cfg = deepMerge(cfg, user);
  const project = await readJsonIfExists(path.join(cwd, '.sol-codex.json'));
  if (project) cfg = deepMerge(cfg, project);
  validateConfig(cfg);
  return cfg;
}

export function validateConfig(cfg) {
  if (cfg.version !== 1) throw new Error('Unsupported config version');
  const positive = [
    ['observationPack.thresholdBytes', cfg.observationPack.thresholdBytes],
    ['observationPack.previewChars', cfg.observationPack.previewChars],
    ['evidenceReducer.thresholdBytes', cfg.evidenceReducer.thresholdBytes],
    ['actionFusion.timeoutMs', cfg.actionFusion.timeoutMs]
  ];
  for (const [name, value] of positive) {
    if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  }
  if (!Array.isArray(cfg.packedCommands)) throw new Error('packedCommands must be an array');
  for (const item of cfg.packedCommands) {
    if (!item?.name || !Array.isArray(item.command) || !item.command.every(x => typeof x === 'string')) {
      throw new Error('Each packedCommands item requires name and string[] command');
    }
  }
  return cfg;
}
