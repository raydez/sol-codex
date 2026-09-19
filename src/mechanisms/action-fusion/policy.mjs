import path from 'node:path';
import { detectCommands } from './project-detector.mjs';

const FORBIDDEN = new Set(['rm', 'sudo', 'shutdown', 'reboot', 'mkfs', 'dd', 'kubectl', 'terraform']);

export function isSafeCommandArray(command) {
  return Array.isArray(command) && command.length > 0 && command.every(x => typeof x === 'string' && !x.includes('\0')) && !FORBIDDEN.has(path.basename(command[0]));
}

export async function resolveNamedCommand(cwd, name, config) {
  const explicit = (config.packedCommands || []).find(x => x.name === name);
  if (explicit) return { ...explicit, source: 'config' };
  // Auto-detected project commands are executable code. Only expose them through
  // run_packed after the user has explicitly enabled Action Fusion. Explicit
  // packedCommands remain an intentional opt-in even when Action Fusion is off.
  if (config.actionFusion?.enabled && config.actionFusion?.autoDetect) {
    const detected = await detectCommands(cwd);
    return detected.find(x => x.name === name) || null;
  }
  return null;
}

export async function planValidation(cwd, changedFiles, config) {
  if (!config.actionFusion.enabled || !changedFiles.length) return [];
  const ruleNames = [];
  for (const rule of config.actionFusion.rules || []) {
    const extensions = Array.isArray(rule.extensions) ? rule.extensions : [];
    if (!extensions.length || changedFiles.some(f => extensions.includes(path.extname(f)))) {
      for (const name of rule.commands || []) if (!ruleNames.includes(name)) ruleNames.push(name);
    }
  }
  let candidates = [];
  if (ruleNames.length) {
    for (const name of ruleNames) {
      const cmd = await resolveNamedCommand(cwd, name, config);
      if (cmd) candidates.push(cmd);
    }
  } else if (config.actionFusion.autoDetect) {
    candidates = await detectCommands(cwd);
  }
  return candidates.filter(x => isSafeCommandArray(x.command)).slice(0, config.actionFusion.maxCommands || 1);
}
