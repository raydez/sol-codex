---
name: sol-codex-harness
description: Optimize long-running Codex coding tasks with local observation archives, exact evidence recall, action-fused validation, deterministic evidence receipts, and compact-state restoration. Use for multi-step coding, debugging, refactoring, repository analysis, or tasks with large logs and repeated tool output.
---

Use SoL-Codex as a harness optimization layer, not as a replacement for correctness.

Rules:
1. Correctness and required verification take priority over efficiency.
2. Archived observations are source evidence. A summary or receipt is not a substitute for exact evidence when exact details matter.
3. When you see an `obs://...` handle, use `obs_get`, `obs_slice`, or `obs_search` to retrieve exact archived content.
4. When you see an `evidence://...` handle, use `evidence_get` to inspect the verified receipt and its source handle.
5. Prefer `run_packed` for verbose diagnostic commands only when that command is explicitly configured or safely auto-detected by SoL-Codex.
6. Never infer that a validation passed unless a validation result says it passed.
7. Do not bypass permission prompts, repository policy, or safety checks to gain efficiency.
8. If a SoL-Codex optimization fails, continue with normal Codex behavior.

Mechanisms:
- Action Fusion: after a supported file patch, SoL-Codex may run one predictable validation command and add a compact validation result to context.
- ObservationPack: large tool results are archived locally with a stable handle. Current Codex hook APIs do not safely suppress arbitrary tool output, so passive archive is the default; `run_packed` provides active packed execution for configured verbose commands.
- Evidence-Preserving Reducer: large diagnostic logs may get deterministic receipts whose quoted spans are verified against the archived source.
- Context Compact: before native Codex compaction, SoL-Codex checkpoints objective, modified files, validations, evidence handles, and unresolved work; after a compact restart it restores only that minimal state.
