# References checked for v0.2.1

The implementation and validation workflow were checked against current public documentation on 2026-09-19.

## Codex

- Non-interactive `codex exec --json` and `turn.completed.usage`:
  https://developers.openai.com/docs/non-interactive-mode
- Codex configuration, `--model`, `--config`, and `model_reasoning_effort`:
  https://developers.openai.com/docs/config-file/config-advanced
  https://developers.openai.com/docs/config-file/config-reference
- Codex hooks:
  https://developers.openai.com/docs/hooks
- MCP extension:
  https://developers.openai.com/docs/extend/mcp

## SWE-bench

- Dataset guide and schema:
  https://github.com/SWE-bench/SWE-bench/blob/main/docs/guides/datasets.md
- SWE-bench Verified dataset:
  https://huggingface.co/datasets/SWE-bench/SWE-bench_Verified
- Official evaluator:
  https://github.com/SWE-bench/SWE-bench

SWE-bench task metadata is fetched from the official Hugging Face dataset service at runtime; SoL-Codex does not copy gold solution patches into prompts.
