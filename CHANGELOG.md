# Changelog

## 0.2.1

- Added validation-grade benchmark manifests and environment fingerprints.
- Added task-cluster bootstrap confidence intervals and non-inferiority quality gates.
- Added paired token-saving CI, exact sign-test, and exact McNemar diagnostics.
- Added `benchmark validate-manifest` and `benchmark validate`.
- Added fixed `swebench-verified-30` suite metadata and official dataset-row fetcher.
- Added SWE-bench manifest preparation, full patch capture, standard prediction export, and official evaluator result import.
- Added `REAL_WORLD_RESULTS.md` and an explicit no-claim-until-validated policy.

## 0.2.0

- Added automated Codex CLI A/B benchmark runner using `codex exec --json` real token usage.
- Added Native / plugin-overhead / per-mechanism / all-on ablation variants.
- Added frozen-revision Git worktrees and deterministic verification commands.
- Added local OTLP/HTTP JSON collector for ChatGPT Desktop / Codex interactive telemetry.
- Added Desktop begin/end/ingest workflow with conversation-overlap detection.
- Added quality-gated `tokens per successful task` and optional `cost per successful task` reporting.
- Added JSON, CSV, and Markdown reports.
- Added optional user-supplied pricing model; no prices are hardcoded.
- Added Observation recall, packed execution, and reducer byte metrics.
- Added benchmark tests, including a fake-Codex end-to-end runner test.

## 0.1.0

- Initial experimental release with Action Fusion, ObservationPack, deterministic Evidence Reducer, compact-state preservation, hooks, local MCP recall, and installer.
