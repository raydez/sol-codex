#!/usr/bin/env node
import { readHookInput, writeHookOutput } from '../../src/runtime/hook-io.mjs';
import { postCompact } from '../../src/hooks/index.mjs';

try {
  const input = await readHookInput();
  const output = await postCompact(input);
  writeHookOutput(output);
} catch (error) {
  console.error(`[sol-codex] post-compact.mjs: ${error?.stack || error}`);
  process.exitCode = 0;
}
