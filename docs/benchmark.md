# Benchmarking SoL-Codex

SoL-Codex v0.2 includes a benchmark subsystem for measuring whether harness optimization lowers Codex resource use **without materially reducing task quality**.

The primary metric is not raw token reduction. It is:

```text
Tokens per successful task
= total input + output tokens / successful runs
```

If explicit pricing is supplied, the stronger metric is:

```text
Cost per successful task
= total modeled API cost / successful runs
```

A savings claim is considered valid only when the quality gate passes. The default gate requires a variant's task success rate to be no more than 2 percentage points below the native Codex baseline.

For automated CLI runs, the `native` variant disables both the SoL-Codex plugin and the registered `sol_codex` MCP server by default, so the baseline does not pay SoL-Codex tool-description overhead. Set `"disableMcpForNative": false` only if you intentionally want a different baseline.

## Two benchmark modes

### 1. Automated Codex CLI A/B

`codex exec --json` emits machine-readable `turn.completed` events with real input, cached-input, output, and reasoning-output token counts. SoL-Codex parses those values directly rather than estimating tokens from bytes.

Create a manifest:

```bash
sol-codex benchmark init
```

Edit `sol-codex-benchmark.json`, then run a small smoke test:

```bash
sol-codex benchmark run \
  --manifest sol-codex-benchmark.json \
  --variants native,all \
  --repeats 1
```

For a proper ablation:

```bash
sol-codex benchmark run \
  --manifest sol-codex-benchmark.json \
  --variants native,plugin-off,observation,action,reducer,compact,all \
  --repeats 3
```

The runner creates a detached Git worktree at the requested revision for every run, writes the appropriate `.sol-codex.json`, toggles the plugin via a Codex CLI config override, invokes `codex exec --json --ephemeral`, executes deterministic verification commands, then removes the worktree.

Variant meanings:

| Variant | Plugin | Mechanisms |
|---|---|---|
| `native` | off | none |
| `plugin-off` | on | all off; measures plugin overhead |
| `observation` | on | ObservationPack |
| `action` | on | Action Fusion |
| `reducer` | on | ObservationPack + Reducer |
| `compact` | on | compact-state preservation |
| `all` | on | all four |

`reducer` intentionally includes ObservationPack because a reducer receipt requires an exact archived source.

### Manifest

```json
{
  "version": 1,
  "outputDir": ".sol-codex-benchmark",
  "defaults": {
    "sandbox": "workspace-write",
    "taskTimeoutMs": 1800000,
    "verifyTimeoutMs": 180000,
    "codexArgs": ["--model", "YOUR_FIXED_MODEL"]
  },
  "tasks": [
    {
      "id": "bug-001",
      "repo": "/absolute/or/relative/repo",
      "revision": "COMMIT_SHA",
      "prompt": "Fix the failing test with the smallest correct change and verify it.",
      "verify": [["npm", "test"]]
    }
  ]
}
```

Freeze the model, reasoning effort, prompt, repository revision, dependencies, test command, sandbox, network policy, and permissions when comparing variants.

Commands in `setup` and `verify` are argv arrays and are executed with `shell:false`. Treat benchmark manifests as executable configuration and review them before running.

## 2. ChatGPT Desktop / Codex interactive benchmark

Desktop does not emit a local `codex exec --json` stream. For Desktop, v0.2 includes a local OTLP/HTTP JSON collector. Codex supports exporting structured OTel logs; `response.completed` records include token counts.

Start the local collector:

```bash
sol-codex benchmark collect
```

Print the required user-level Codex configuration:

```bash
sol-codex benchmark otel-config
```

It prints:

```toml
[otel]
environment = "sol-codex-benchmark"
log_user_prompt = false

[otel.exporter."otlp-http"]
endpoint = "http://127.0.0.1:4318/v1/logs"
protocol = "json"
```

Add that to **user-level** `~/.codex/config.toml`, then restart Codex/Desktop. Codex does not allow project config to override telemetry routing.

For each manual run:

```bash
sol-codex benchmark begin --task bug-001 --variant native
# perform exactly one fresh Desktop Codex task
sol-codex benchmark end --success true --test-pass true
sol-codex benchmark ingest --otel .sol-codex-benchmark/otel.jsonl
```

Repeat for `all` and, if desired, each ablation variant. Use a fresh conversation for every run. Do not run two benchmark conversations concurrently because their telemetry time windows can overlap. If overlap occurs, `ingest` reports multiple conversation IDs; re-run it with `--conversation-id ID`.

## Reports

```bash
sol-codex benchmark report
```

Produces:

```text
.sol-codex-benchmark/
├── runs/*.json
├── artifacts/*
├── report.json
├── report.csv
└── report.md
```

The report includes:

- success rate;
- test-pass rate;
- input / cached-input / output tokens;
- total tokens per successful task;
- model turns per successful task;
- tool calls per successful task;
- wall time per successful task;
- quality gate;
- optional modeled cost per successful task.

## Optional cost model

SoL-Codex deliberately does not hardcode model prices. Create a pricing file with the current rates for the exact model/account you are testing:

```json
{
  "inputPer1M": 0,
  "cachedInputPer1M": 0,
  "outputPer1M": 0
}
```

Then:

```bash
sol-codex benchmark report --pricing pricing.json
```

The calculation treats cached input as a subset of input tokens, so it is not double-counted.

## Recommended experiment size

For an initial credible benchmark:

```text
40 frozen tasks
× 2 variants (Native / All)
× 3 repetitions
= 240 runs
```

Then run the seven-way ablation on a smaller representative subset if full cost is excessive.

Suggested task mix:

- 10 large-log diagnosis tasks;
- 10 bug-fix + test tasks;
- 10 multi-file refactors;
- 10 repository exploration + implementation tasks.

## Interpreting savings

Do not claim a mechanism is cheaper because it archived many bytes. Passive `PostToolUse` archiving happens after native output has already been visible to Codex. It provides evidence storage, but by itself does not prove token savings.

The active path is `run_packed`: the command is executed by SoL-Codex, raw output stays local, and Codex receives a compact preview/receipt plus an exact-recall handle. Token savings must still be demonstrated by the A/B results.

Do not add mechanism-level percentage savings together. Mechanisms overlap.

## v0.2.1 validation-grade mode

For claims about real savings, use a frozen manifest with an exact model, reasoning effort, and 40-hex commit SHA for every task:

```json
{
  "version": 1,
  "environment": {
    "model": "YOUR_EXACT_MODEL",
    "reasoningEffort": "medium"
  },
  "tasks": [
    {
      "id": "bug-001",
      "repo": "/path/to/repo",
      "revision": "0123456789abcdef0123456789abcdef01234567",
      "prompt": "Fix the bug and verify it.",
      "verify": [["npm", "test"]]
    }
  ]
}
```

Validate before spending usage:

```bash
sol-codex benchmark validate-manifest --manifest sol-codex-benchmark.json
```

Run:

```bash
sol-codex benchmark run \
  --manifest sol-codex-benchmark.json \
  --variants native,all \
  --repeats 3 \
  --validation-grade
```

Statistical decision:

```bash
sol-codex benchmark validate \
  --variant all \
  --min-tasks 30 \
  --min-paired-success-tasks 20 \
  --bootstrap-iterations 5000 \
  --alpha 0.05
```

Exit codes:

```text
0  SUPPORTED
2  INCONCLUSIVE
3  QUALITY-REGRESSION
```

The validator clusters repeated runs by task. It does not treat three runs of the same issue as three independent benchmark tasks.

See `docs/validation-protocol.md` for the exact decision rule.

## Built-in SWE-bench Verified 30 subset

List the fixed IDs:

```bash
sol-codex benchmark suite --action list --name swebench-verified-30
```

Fetch the official dataset rows:

```bash
sol-codex benchmark suite \
  --action fetch \
  --name swebench-verified-30 \
  --output swebench-verified-30.jsonl
```

This helper deliberately does not reimplement the SWE-bench evaluator. The recommended end-to-end workflow is:

### 1. Prepare a frozen Codex manifest

```bash
sol-codex benchmark suite \
  --action prepare \
  --rows swebench-verified-30.jsonl \
  --repos-dir .swebench-repos \
  --manifest-output swebench-sol-codex.json \
  --model YOUR_EXACT_CODEX_MODEL \
  --reasoning-effort medium
```

`prepare` creates local bare mirrors of the official repositories and pins every task to its official `base_commit`. It deliberately excludes the gold solution patch from the prompt.

### 2. Run paired Codex inference

```bash
sol-codex benchmark run \
  --manifest swebench-sol-codex.json \
  --variants native,all \
  --repeats 3 \
  --validation-grade
```

SWE-bench tasks are marked `externalVerification: swebench`, so success/test-pass remain pending until official grading is imported.

### 3. Export exact patches

For each variant and repeat:

```bash
sol-codex benchmark export-swebench --variant native --repeat 1 --output native-r1.json
sol-codex benchmark export-swebench --variant all    --repeat 1 --output all-r1.json
```

The exporter reads the full binary-capable `git diff` captured for each run and emits standard SWE-bench prediction objects.

### 4. Grade with official SWE-bench

Using the official SWE-bench package/environment:

```bash
swebench eval verified -p native-r1.json --run-id sol-codex-native-r1 -j 8
swebench eval verified -p all-r1.json    --run-id sol-codex-all-r1    -j 8
```

The legacy `python -m swebench.harness.run_evaluation ...` invocation is also supported upstream.

### 5. Import official verdicts

```bash
sol-codex benchmark import-swebench \
  --results logs/evaluation/sol-codex-native-r1/results.json \
  --variant native --repeat 1

sol-codex benchmark import-swebench \
  --results logs/evaluation/sol-codex-all-r1/results.json \
  --variant all --repeat 1
```

Repeat steps 3-5 for repetitions 2 and 3.

### 6. Make the statistical decision

```bash
sol-codex benchmark validate --variant all
```

Use the official evaluator for environment construction and grading, and gold-patch sanity-check the selected tasks before publishing a comparison. Infrastructure/evaluator failures must not be counted as agent quality failures.
