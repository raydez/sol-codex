# Security Policy

## Scope

SoL-Codex runs local hooks and may execute configured project validation commands. Treat plugin installation and hook trust with the same care as other development tooling.

## Safe defaults

- Action Fusion is disabled by default.
- The evidence reducer is deterministic and local-only.
- No source log is uploaded by SoL-Codex v0.2.
- Action Fusion uses argv arrays with `shell:false` and blocks known destructive executables.
- The plugin never auto-approves Codex permission prompts.

## Sensitive data

Diagnostic output can contain secrets. The deterministic reducer detects common secret patterns and refuses to create a compact receipt when they are found. This is a best-effort detector, not DLP. Archived raw output remains on the local machine.

## Reporting

Do not include secrets or private repository contents in public vulnerability reports. Provide a minimal reproduction.

## Benchmark telemetry

The v0.2 Desktop benchmark collector binds to `127.0.0.1` by default and writes received OTLP JSON to a local file. The generated Codex OTel snippet sets `log_user_prompt = false`, so prompt text remains redacted unless the user changes that setting. OTel may still contain repository/tool metadata, model names, conversation identifiers, error details, and token counts; treat benchmark artifacts as potentially sensitive and do not commit `.sol-codex-benchmark/`.

The automated CLI benchmark executes `setup` and `verify` command arrays from the benchmark manifest. Review a manifest before running it. Commands are spawned with `shell:false`, but they still execute with the current user's OS permissions.
