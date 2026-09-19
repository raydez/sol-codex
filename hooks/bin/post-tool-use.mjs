#!/usr/bin/env node
import { readHookInput, writeHookOutput } from '../../src/runtime/hook-io.mjs';
import { postToolUse } from '../../src/hooks/index.mjs';

try {
  const input = await readHookInput();
  const output = await postToolUse(input);
  writeHookOutput(output);
} catch (error) {
  console.error(`[sol-codex] post-tool-use.mjs: ${error?.stack || error}`);
  process.exitCode = 0;
}
