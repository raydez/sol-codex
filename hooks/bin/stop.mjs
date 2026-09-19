#!/usr/bin/env node
import { readHookInput, writeHookOutput } from '../../src/runtime/hook-io.mjs';
import { stopHook } from '../../src/hooks/index.mjs';

try {
  const input = await readHookInput();
  const output = await stopHook(input);
  writeHookOutput(output);
} catch (error) {
  console.error(`[sol-codex] stop.mjs: ${error?.stack || error}`);
  process.exitCode = 0;
}
