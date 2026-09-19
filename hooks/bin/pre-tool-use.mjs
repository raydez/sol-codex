#!/usr/bin/env node
import { readHookInput, writeHookOutput } from '../../src/runtime/hook-io.mjs';
import { preToolUse } from '../../src/hooks/index.mjs';

try {
  const input = await readHookInput();
  const output = await preToolUse(input);
  writeHookOutput(output);
} catch (error) {
  console.error(`[sol-codex] pre-tool-use.mjs: ${error?.stack || error}`);
  process.exitCode = 0;
}
