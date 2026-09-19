#!/usr/bin/env node
import { readHookInput, writeHookOutput } from '../../src/runtime/hook-io.mjs';
import { preCompact } from '../../src/hooks/index.mjs';

try {
  const input = await readHookInput();
  const output = await preCompact(input);
  writeHookOutput(output);
} catch (error) {
  console.error(`[sol-codex] pre-compact.mjs: ${error?.stack || error}`);
  process.exitCode = 0;
}
