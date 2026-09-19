#!/usr/bin/env node
import { readHookInput, writeHookOutput } from '../../src/runtime/hook-io.mjs';
import { userPromptSubmit } from '../../src/hooks/index.mjs';

try {
  const input = await readHookInput();
  const output = await userPromptSubmit(input);
  writeHookOutput(output);
} catch (error) {
  console.error(`[sol-codex] user-prompt-submit.mjs: ${error?.stack || error}`);
  process.exitCode = 0;
}
