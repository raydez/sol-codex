import { spawn } from 'node:child_process';
import { isSafeCommandArray } from './policy.mjs';

export async function runCommand(command, { cwd, timeoutMs = 120000, maxOutputBytes = 2_000_000 } = {}) {
  if (!isSafeCommandArray(command)) throw new Error('Unsafe or invalid command');
  const [bin, ...args] = command;
  return new Promise((resolve) => {
    const child = spawn(bin, args, { cwd, shell: false, env: process.env });
    const chunks = [];
    let bytes = 0;
    let truncated = false;
    const push = (prefix, chunk) => {
      if (bytes >= maxOutputBytes) { truncated = true; return; }
      const buf = Buffer.from(chunk);
      const remaining = maxOutputBytes - bytes;
      const use = buf.subarray(0, remaining);
      chunks.push(Buffer.from(prefix), use);
      bytes += Buffer.byteLength(prefix) + use.length;
      if (use.length < buf.length) truncated = true;
    };
    child.stdout?.on('data', c => push('', c));
    child.stderr?.on('data', c => push('[stderr] ', c));
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, timeoutMs);
    child.on('error', error => {
      clearTimeout(timer);
      resolve({ command, exitCode: null, signal: null, timedOut, truncated, output: `Failed to launch: ${error.message}` });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ command, exitCode: code, signal, timedOut, truncated, output: Buffer.concat(chunks).toString('utf8') });
    });
  });
}
