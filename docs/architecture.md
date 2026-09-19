# Architecture

```text
Codex
  ├─ Skill: behavior guidance
  ├─ Lifecycle Hooks
  │   ├─ SessionStart / UserPromptSubmit
  │   ├─ PostToolUse
  │   ├─ PreCompact / PostCompact
  │   └─ Stop
  └─ Local MCP
      ├─ exact observation recall
      ├─ evidence receipts
      └─ packed validation execution

SoL-Codex Core
  ├─ Action Fusion
  ├─ ObservationPack
  ├─ Evidence-Preserving Reducer
  └─ Compact State Preservation
```

The hook adapter layer normalizes Codex event payloads. Mechanisms operate on internal objects so they can later be reused by other runtime adapters.
