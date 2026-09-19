import fs from 'node:fs/promises';
import path from 'node:path';

export async function appendJsonl(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await fs.appendFile(file, JSON.stringify(value) + '\n', { encoding: 'utf8', mode: 0o600 });
}

export async function readJsonl(file) {
  try {
    const text = await fs.readFile(file, 'utf8');
    return text.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}
