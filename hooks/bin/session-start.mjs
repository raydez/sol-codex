#!/usr/bin/env node
import { readHookInput, writeHookOutput } from '../../src/runtime/hook-io.mjs';
import { sessionStart } from '../../src/hooks/index.mjs';

try {
  const input = await readHookInput();
  const output = await sessionStart(input);
  writeHookOutput(output);
} catch (error) {
  console.error(`[sol-codex] session-start.mjs: ${error?.stack || error}`);
  process.exitCode = 0;
}
