# SoL-Codex Validation Protocol v0.2.1

This protocol answers one question:

> Does SoL-Codex reduce Codex token/cost consumption without a material loss of task quality?

It is intentionally stricter than a simple before/after token comparison.

## 1. Primary estimand

The primary efficiency metric is:

```text
Tokens per successful task
= total Codex input + output tokens / successful runs
```

If an explicit current pricing file is supplied, the analogous monetary metric is:

```text
Cost per successful task
= modeled API cost / successful runs
```

Cached input is a subset of input tokens and is not double-counted in total tokens.

## 2. Quality constraints

A cost-saving conclusion requires non-inferior quality.

Default non-inferiority margin:

```text
2 percentage points
```

The implementation checks both:

- task success rate;
- deterministic test-pass rate.

For validation-grade conclusions, SoL-Codex uses task-cluster bootstrap confidence intervals rather than only point estimates.

## 3. Experimental unit and pairing

The task is the statistical cluster. Repeated runs of the same task are not treated as independent tasks.

Pair runs by:

```text
task_id + repeat
```

Recommended primary experiment:

```text
30 distinct tasks
× 2 variants (native, all)
× 3 repeats
= 180 runs
```

Run the seven-way mechanism ablation after the primary experiment, or on a representative subset if model cost is material.

## 4. Frozen factors

Validation-grade manifests must freeze:

- exact Codex model;
- model reasoning effort;
- exact 40-hex repository commit SHA;
- task prompt;
- deterministic verification command;
- sandbox mode;
- relevant setup commands;
- SoL-Codex version.

The benchmark runner also records a runtime environment fingerprint containing Codex version, SoL-Codex version, Node version, OS/architecture, model, reasoning effort, sandbox, and manifest hash.

## 5. Random/order effects

SoL-Codex rotates variant execution order across task/repeat cells to reduce systematic order bias.

Use fresh detached Git worktrees and `codex exec --ephemeral` for every CLI run.

Do not share a conversation/session between A/B variants.

## 6. Statistical validation

For each candidate variant versus `native`:

### Quality

Task-cluster bootstrap 95% confidence intervals are computed for:

```text
success-rate delta = candidate - native
test-pass delta    = candidate - native
```

The CI quality gate passes only if both lower bounds are greater than or equal to `-tolerance`.

### Token saving

For each task, repetitions where both variants succeed are paired. Task-level mean token usage is computed, then:

```text
token saving = 1 - candidate_tokens / native_tokens
```

A task-cluster bootstrap 95% confidence interval is computed across tasks.

The token-saving evidence gate passes only if the lower bound is greater than zero.

### Diagnostics

The report also includes:

- exact two-sided sign test on task-level token-saving direction;
- exact McNemar diagnostics for paired success outcomes;
- exact McNemar diagnostics for paired test-pass outcomes.

These diagnostics do not replace the non-inferiority and bootstrap gates.

## 7. Decision statuses

### SUPPORTED

All are true:

- minimum distinct-task threshold met;
- minimum paired-successful-task threshold met;
- success quality CI gate passes;
- test-pass quality CI gate passes;
- token-saving 95% CI lower bound > 0.

### QUALITY-REGRESSION

Observed quality is materially worse, or the confidence interval is entirely beyond the configured non-inferiority margin.

### ENVIRONMENT-MISMATCH

For CLI runs, frozen environment fingerprints are missing or differ across compared runs (for example Codex version, model, reasoning effort, sandbox, manifest hash, or SoL-Codex version). No performance claim should be made until the mismatch is resolved.

### INCONCLUSIVE

Examples:

- too few tasks;
- too few jointly successful tasks;
- token-saving CI crosses zero;
- quality CI is too wide to establish non-inferiority.

`INCONCLUSIVE` is not failure and is not evidence of savings.

## 8. Recommended task composition

For SoL-Codex mechanisms, include tasks likely to exercise different harness bottlenecks:

- large-log diagnosis;
- bug fix + deterministic test;
- multi-file refactor;
- repository exploration + implementation;
- long-running tasks that trigger compaction;
- verbose build/test commands that can use packed execution.

Avoid choosing only tasks known to favor the plugin.

## 9. SWE-bench Verified 30 subset

The repository contains `benchmark/suites/swebench-verified-30.json` with 30 fixed instance IDs from `SWE-bench/SWE-bench_Verified`.

Fetch official rows with:

```bash
sol-codex benchmark suite --action fetch --name swebench-verified-30 --output swebench-verified-30.jsonl
```

Prepare the frozen manifest:

```bash
sol-codex benchmark suite \
  --action prepare \
  --rows swebench-verified-30.jsonl \
  --repos-dir .swebench-repos \
  --manifest-output swebench-sol-codex.json \
  --model YOUR_EXACT_CODEX_MODEL \
  --reasoning-effort medium
```

Run Native and All with `--validation-grade`, export a prediction file for each `variant × repeat`, grade it with the official evaluator, then import the corresponding official `results.json`:

```bash
sol-codex benchmark export-swebench --variant native --repeat 1 --output native-r1.json
swebench eval verified -p native-r1.json --run-id sol-codex-native-r1 -j 8
sol-codex benchmark import-swebench \
  --results logs/evaluation/sol-codex-native-r1/results.json \
  --variant native --repeat 1
```

Repeat for all cells before calling `benchmark validate`. This makes Codex responsible for token telemetry and the official SWE-bench harness responsible for correctness. SoL-Codex does not self-grade its patches.

SWE-bench Verified is a 500-instance, human-validated set of real GitHub issue/PR tasks. Before publishing SoL-Codex results, sanity-check the selected tasks with the official gold patch. SWE-bench has documented instance-specific evaluator/image brittleness, so infrastructure failures must not be misclassified as agent quality failures.

Sources:

- https://github.com/SWE-bench/SWE-bench/blob/main/docs/guides/datasets.md
- https://huggingface.co/datasets/SWE-bench/SWE-bench_Verified
- https://github.com/SWE-bench/SWE-bench

## 10. Claim language

Allowed after `SUPPORTED`:

```text
On this frozen benchmark, SoL-Codex reduced paired total token usage by X%,
95% bootstrap CI [L%, U%], while meeting the configured 2 percentage-point
non-inferiority criterion for task success and deterministic test pass.
```

Not allowed from synthetic tests or incomplete experiments:

```text
SoL-Codex saves 30% on Codex.
```

Synthetic tests in this repository only verify measurement/statistical code paths.
