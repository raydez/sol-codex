# SoL-Codex

<p align="center">English | <a href="README.zh.md">简体中文</a></p>

**A harness optimization layer for long-running Codex agents.**

Inspired by NVIDIA’s SoL-Pi, SoL-Codex is an independent Codex-native implementation that does not modify Codex or the underlying model and is not affiliated with NVIDIA or OpenAI.

It implements four mechanisms:

- **Action Fusion** — after an `apply_patch`, optionally run one predictable validation without another model decision round-trip.
- **ObservationPack** — archive large tool results locally under stable `obs://...` handles with exact recall.
- **Evidence-Preserving Reducer** — create deterministic diagnostic receipts only when every retained quote verifies against the archived source.
- **Context Compact state preservation** — checkpoint task-critical state before native Codex compaction and restore it on `SessionStart(source="compact")`.

> Correctness > efficiency. Evidence > summary. Fallback > failure.

## Requirements

- Node.js 22+
- Codex Desktop / ChatGPT Desktop with Codex, or Codex CLI with current plugin/hooks support
- Codex CLI is recommended for automatic local MCP registration

## Fast local install

macOS / Linux:

```bash
git clone https://github.com/raydez/sol-codex.git
cd sol-codex
./install.sh
```

Windows PowerShell:

```powershell
git clone https://github.com/raydez/sol-codex.git
cd sol-codex
./install.ps1
```

The installer:

1. runs tests;
2. copies the plugin to `~/.codex/plugins/sol-codex`;
3. adds a personal marketplace entry to `~/.agents/plugins/marketplace.json`;
4. uses the bundled zero-dependency MCP compatibility server immediately;
5. optionally uses the official MCP TypeScript SDK v2 when those optional packages are installed;
6. runs `codex mcp add sol_codex ...` when the Codex CLI is available.

Then restart ChatGPT Desktop / Codex, install or enable **SoL-Codex** from your personal marketplace source, open `/hooks` and review/trust its hooks, and verify `/mcp` shows `sol_codex`.

Codex intentionally does **not** auto-trust third-party hooks. That review step cannot and should not be bypassed by this installer.

## GitHub marketplace install

Once this repository is published, users can add it as a marketplace source:

```bash
codex plugin marketplace add OWNER/sol-codex
```

The repository includes `.agents/plugins/marketplace.json`. Local evidence MCP still needs a local process, so run the repository installer once or manually register the MCP server.

## Manual MCP registration

```bash
## Optional: install the official MCP TypeScript SDK v2
npm run install:modern-mcp

# Register the local STDIO MCP server
codex mcp add sol_codex --env SOL_CODEX_DATA_DIR="$HOME/.local/share/sol-codex" -- node "$PWD/src/mcp/server.mjs"
```

On macOS, the default data directory used by SoL-Codex is `~/Library/Application Support/sol-codex`; the installer passes the correct path automatically.

## Project setup

From a project you want to optimize:

```bash
node /path/to/sol-codex/src/cli/main.mjs init
```

To opt into Action Fusion at initialization:

```bash
node /path/to/sol-codex/src/cli/main.mjs init --action-fusion
```

Action Fusion is **off by default** because it executes project validation commands. Observation archiving, deterministic receipt generation, and compact-state checkpointing are on by default and are non-destructive.

Review `.sol-codex.json` before enabling Action Fusion. Commands are executed with `shell:false`; arbitrary model-generated shell is never passed to Action Fusion.

## How ObservationPack works on Codex today

Codex `PostToolUse` hooks can add context, but current hook APIs do not provide a safe general-purpose `updated tool output` replacement for arbitrary local tools. SoL-Codex therefore uses two modes:

1. **Passive archive (default)**: large native tool results are archived locally and a short exact-recall handle is added to context. Native Codex behavior remains unchanged.
2. **Packed execution via MCP**: for configured verbose commands, Codex can call `run_packed`. The command's full output stays local while the model receives a compact result plus an `obs://...` handle.

This is deliberate: SoL-Codex does not misuse `PostToolUse decision:block` or `continue:false` merely to fake output suppression.

## MCP tools

- `obs_get(handle, max_chars?)`
- `obs_slice(handle, offset, limit)`
- `obs_search(handle, query, ...)`
- `evidence_get(handle)`
- `harness_status(cwd?)`
- `run_packed(cwd, name, ...)`

`run_packed` will only execute a named command from project `packedCommands`, or—after Action Fusion is explicitly enabled—a conservative auto-detected validation command (`typecheck`, `lint`, `test`, or `go test`).

## Data

All archives remain local. Default locations:

- macOS: `~/Library/Application Support/sol-codex`
- Linux: `$XDG_DATA_HOME/sol-codex` or `~/.local/share/sol-codex`
- Windows: `%LOCALAPPDATA%\\sol-codex`

Per session:

```text
sessions/<session-id>/
├── state.json
├── metrics.jsonl
├── observations/
├── evidence/
└── compact/latest.json
```

## Configuration

Project config: `.sol-codex.json`

User config: `$XDG_CONFIG_HOME/sol-codex/config.json` or `~/.config/sol-codex/config.json`

See `config/sol-codex.example.json`.

## Security model

SoL-Codex is not a sandbox and is not a security boundary.

- No remote reducer exists in v0.2.1.
- Archives are local.
- Action Fusion is opt-in.
- Destructive command basenames are rejected by the fused runner.
- Commands are executed as argv arrays with `shell:false`.
- Evidence receipts are SHA-256 bound to their source and every quote span is exact-verified.
- Hook errors fail open to native Codex behavior.

See [SECURITY.md](SECURITY.md).

## Verify installation

```bash
npm test
npm run doctor
```

In Codex:

```text
/hooks
/mcp
```

## Benchmark and cost validation

v0.2.1 is the **Validation Edition**. It does not claim a real-world token saving until users run a controlled Codex experiment and the statistical validation gate passes.

### Validation-grade Codex CLI A/B

Create a manifest:

```bash
sol-codex benchmark init
```

Edit two required frozen fields:

```json
{
  "environment": {
    "model": "YOUR_EXACT_CODEX_MODEL",
    "reasoningEffort": "medium"
  }
}
```

Every task must also use an exact 40-character Git commit SHA and should provide a deterministic `verify` command.

Check the manifest before spending model usage:

```bash
sol-codex benchmark validate-manifest \
  --manifest sol-codex-benchmark.json
```

Run the primary Native-vs-All experiment:

```bash
sol-codex benchmark run \
  --manifest sol-codex-benchmark.json \
  --variants native,all \
  --repeats 3 \
  --validation-grade
```

Then run the statistical decision gate:

```bash
sol-codex benchmark validate \
  --variant all \
  --min-tasks 30 \
  --min-paired-success-tasks 20
```

The report uses Codex-reported `turn.completed.usage` token counts. It adds task-cluster bootstrap 95% confidence intervals, a paired token-saving sign test, and exact McNemar diagnostics for binary quality outcomes.

A saving claim is marked **SUPPORTED** only when all of these hold:

1. the minimum task/sample gate passes;
2. the 95% CI for success-rate delta stays above the configured non-inferiority margin;
3. the 95% CI for test-pass delta stays above the same margin;
4. the 95% CI for paired token saving is above zero.

Otherwise the result is `INCONCLUSIVE` or `QUALITY-REGRESSION`. A lower raw token number alone is not enough.

### Built-in real GitHub task subset

The repository includes a fixed 30-instance subset of **SWE-bench Verified**, a human-validated benchmark of real GitHub issue/PR tasks.

List it:

```bash
sol-codex benchmark suite \
  --action list \
  --name swebench-verified-30
```

Fetch the official rows from the Hugging Face SWE-bench dataset server:

```bash
sol-codex benchmark suite \
  --action fetch \
  --name swebench-verified-30 \
  --output swebench-verified-30.jsonl
```

This command intentionally fetches official task metadata only. For an end-to-end validation run, prepare a frozen SoL-Codex manifest from those rows:

```bash
sol-codex benchmark suite \
  --action prepare \
  --rows swebench-verified-30.jsonl \
  --repos-dir .swebench-repos \
  --manifest-output swebench-sol-codex.json \
  --model YOUR_EXACT_CODEX_MODEL \
  --reasoning-effort medium
```

Then run Native and All with external quality verification pending:

```bash
sol-codex benchmark run \
  --manifest swebench-sol-codex.json \
  --variants native,all \
  --repeats 3 \
  --validation-grade
```

For every repetition, export the exact Git patch produced by Codex:

```bash
sol-codex benchmark export-swebench \
  --variant native --repeat 1 \
  --output native-r1.json

sol-codex benchmark export-swebench \
  --variant all --repeat 1 \
  --output all-r1.json
```

Grade each prediction file with the official SWE-bench evaluator, for example:

```bash
swebench eval verified -p native-r1.json --run-id sol-codex-native-r1 -j 8
swebench eval verified -p all-r1.json    --run-id sol-codex-all-r1    -j 8
```

Import the official `results.json` back into the corresponding SoL-Codex run cells:

```bash
sol-codex benchmark import-swebench \
  --results logs/evaluation/sol-codex-native-r1/results.json \
  --variant native --repeat 1

sol-codex benchmark import-swebench \
  --results logs/evaluation/sol-codex-all-r1/results.json \
  --variant all --repeat 1
```

Repeat export/evaluate/import for repetitions 2 and 3, then run:

```bash
sol-codex benchmark validate --variant all
```

SoL-Codex never uses the SWE-bench gold patch in the Codex task prompt. Correct environment construction and grading remain the responsibility of the official SWE-bench evaluator. Before publishing a result, also sanity-check the selected instances with `swebench eval verified --gold` because evaluator/image failures must not be mislabeled as agent failures.

### Full mechanism ablation

After the primary Native-vs-All experiment, investigate mechanism contribution:

```bash
sol-codex benchmark run \
  --manifest sol-codex-benchmark.json \
  --variants native,plugin-off,observation,action,reducer,compact,all \
  --repeats 3 \
  --validation-grade
```

Do not add mechanism percentages together; effects overlap.

### Desktop / ChatGPT Desktop

Desktop experiments still use the local OTLP/HTTP JSON collector:

```bash
sol-codex benchmark collect
sol-codex benchmark otel-config
```

Mark each fresh task session:

```bash
sol-codex benchmark begin --task bug-001 --variant native
# perform one fresh Desktop Codex task
sol-codex benchmark end --success true --test-pass true
sol-codex benchmark ingest --otel .sol-codex-benchmark/otel.jsonl
```

Repeat with `all`, then:

```bash
sol-codex benchmark report
sol-codex benchmark validate --variant all
```

### Real-world results policy

`REAL_WORLD_RESULTS.md` starts empty by design. Add a result only when the exact Codex version, model, reasoning effort, task set, repository revisions, repeats, quality criteria, and validation report are preserved. Synthetic unit tests validate the benchmark machinery; they are not evidence that SoL-Codex saves tokens in real Codex runs.

See [docs/benchmark.md](docs/benchmark.md) and [docs/validation-protocol.md](docs/validation-protocol.md).

## Current Codex API constraint

This release intentionally does not claim that passive ObservationPack halves Codex token usage. Native `PostToolUse` currently cannot safely replace arbitrary native tool results using `updatedMCPToolOutput` / `suppressOutput`; those fields are parsed but not fully supported. Real active packing is therefore exposed through the local MCP `run_packed` path, while native tool outputs are archived passively.

## Status

Experimental v0.2.1 Validation Edition. The repository is designed as the first runtime adapter on a longer path toward model-independent Harness Evolution.

## Attribution

Inspired by NVIDIA's SoL-Pi paper and public implementation. SoL-Codex is an independent clean implementation for Codex and is not affiliated with NVIDIA or OpenAI.

## License

MIT
