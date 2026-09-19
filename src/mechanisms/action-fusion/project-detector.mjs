import fs from 'node:fs/promises';
import path from 'node:path';

async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}

export async function detectCommands(cwd) {
  const pkgFile = path.join(cwd, 'package.json');
  if (await exists(pkgFile)) {
    try {
      const pkg = JSON.parse(await fs.readFile(pkgFile, 'utf8'));
      const scripts = pkg.scripts || {};
      const manager = await packageManager(cwd);
      const names = ['typecheck', 'lint', 'test'];
      return names.filter(name => typeof scripts[name] === 'string' && !/no test specified/i.test(scripts[name]))
        .map(name => ({ name, command: managerCommand(manager, name), source: 'auto:package.json' }));
    } catch {}
  }
  if (await exists(path.join(cwd, 'go.mod'))) return [{ name: 'test', command: ['go', 'test', './...'], source: 'auto:go' }];
  return [];
}

async function packageManager(cwd) {
  if (await exists(path.join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (await exists(path.join(cwd, 'yarn.lock'))) return 'yarn';
  if (await exists(path.join(cwd, 'bun.lockb')) || await exists(path.join(cwd, 'bun.lock'))) return 'bun';
  return 'npm';
}

function managerCommand(manager, script) {
  if (manager === 'npm') return ['npm', 'run', script];
  if (manager === 'yarn') return ['yarn', script];
  if (manager === 'pnpm') return ['pnpm', 'run', script];
  if (manager === 'bun') return ['bun', 'run', script];
  return [manager, 'run', script];
}
