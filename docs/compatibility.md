# Compatibility

This project targets the Codex plugin/hooks and telemetry behavior documented on 2026-09-19 and MCP TypeScript SDK v2 (2026-07-28 protocol generation).

v0.2 relies on these documented Codex behaviors:

- `codex exec --json` emits JSONL with `turn.completed.usage.input_tokens`, `cached_input_tokens`, `output_tokens`, and `reasoning_output_tokens`;
- `--config` can override arbitrary Codex configuration for a single CLI run;
- project/plugin enablement can be controlled by plugin configuration;
- Codex OTel supports OTLP/HTTP with `protocol = "json"`;
- Codex OTel structured events include API/tool activity and token counts on `response.completed`;
- lifecycle hooks are available to installed local plugins.

The repository test suite validates parsers, benchmark aggregation, a local OTLP/HTTP JSON collector, mechanism logic, MCP protocol behavior, and an end-to-end fake-Codex benchmark runner using real Git worktrees.

It does **not** emulate every ChatGPT Desktop UI behavior. Before publishing a compatibility claim for a concrete Desktop or CLI release, record the exact tested app/CLI version and OS here.
