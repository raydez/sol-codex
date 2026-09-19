# SoL-Codex v0.2.1 — Validation Edition

v0.2.1 hardens the v0.2 Benchmark Edition so users can distinguish real Codex savings from benchmark noise or quality regression.

## Added

- validation-grade manifests with frozen model, reasoning effort, and exact Git commit revisions;
- runtime environment fingerprints for every CLI run;
- task-cluster bootstrap 95% confidence intervals;
- non-inferiority confidence gates for success and deterministic test-pass rates;
- paired task-level token-saving confidence intervals;
- exact sign-test diagnostic for saving direction;
- exact McNemar diagnostics for paired binary outcomes;
- `benchmark validate-manifest`;
- `benchmark validate` with exit status suitable for CI;
- built-in fixed `swebench-verified-30` real-GitHub-task subset metadata;
- official SWE-bench Verified row fetcher;
- SWE-bench manifest preparation with official `base_commit` pinning and local repo mirrors;
- full `model.patch` capture for every CLI run;
- standard SWE-bench prediction export per variant/repeat;
- import of official SWE-bench `results.json` resolved/unresolved verdicts;
- `REAL_WORLD_RESULTS.md` policy preventing synthetic benchmark claims.

## Important

The repository's own tests prove that the measurement and decision machinery works. They do **not** prove that real Codex runs save tokens. A real result is claimable only when `benchmark validate` returns `SUPPORTED` on a sufficiently large frozen experiment.
