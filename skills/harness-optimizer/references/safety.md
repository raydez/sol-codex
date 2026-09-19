# Safety constraints

- SoL-Codex never auto-runs destructive commands.
- Action Fusion only executes configured or conservative auto-detected validation commands using `spawn(..., {shell:false})`.
- `run_packed` only runs a named command that resolves from project configuration or the conservative detector.
- Remote reduction is not implemented in v0.2. All archives and deterministic receipts remain local.
- Hook optimization failures must fall back to native Codex behavior.
