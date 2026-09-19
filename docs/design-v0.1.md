# SoL-Codex Plugin｜Codex Desktop Harness Optimization 设计与落地方案 v0.1

> 项目定位：面向 Codex Desktop / Codex CLI 的 Harness Optimization Plugin  
> 项目形态：GitHub 开源项目  
> 建议仓库名：`sol-codex`  
> 首版目标：将 SoL-Pi 的四类 Harness Efficiency Mechanism 以 Codex 原生 Plugin + Skill + Hooks + MCP 的方式重新实现  
> 日期：2026-09-19  
> 状态：可开仓开发

---

# 0. Executive Summary

`SoL-Codex` 不是对 SoL-Pi 的直接移植，也不是一个“提示词 Skill”。

它是一个面向 Codex Runtime 的 Harness Optimization Plugin，目标是在**不修改 Codex 本体、不改变模型能力、不减少必要验证、不隐藏原始 Evidence** 的前提下，降低长任务中的：

- 重复模型轮次；
- 重复工具决策；
- 大 Observation 反复进入上下文；
- 已完成阶段长期占用 Context；
- 大日志由主模型重复阅读；
- 无意义 Token replay；
- 不必要的高成本 Reasoning。

首版实现四个 Mechanism：

```text
1. Action Fusion
2. ObservationPack
3. Evidence-Preserving Reducer
4. Online Context Compact
```

但它们在 Codex 中不能照搬 SoL-Pi 的实现方式，而应映射到 Codex 当前原生扩展能力：

```text
Skill
+
Lifecycle Hooks
+
Local Archive
+
MCP Recall Tools
+
Harness State
```

最终结构：

```text
                    Codex
                      │
              ┌───────┴────────┐
              │                │
            Skill            Hooks
        usage policy      runtime events
              │                │
              └───────┬────────┘
                      │
                SoL-Codex Core
                      │
        ┌─────────────┼─────────────┐
        │             │             │
 Action Fusion   Context Logic   Reducer
        │             │             │
        └─────────────┼─────────────┘
                      │
              Observation Store
                      │
                      ▼
                 MCP Recall
```

项目第一阶段应聚焦：

> **Codex Desktop 上可运行、可测量、可关闭、可回滚。**

不要第一版就做 Auto-Research 或 RSI。

---

# 1. 项目目标

## 1.1 核心目标

SoL-Codex v0.1 需要回答一个明确问题：

> SoL-Pi 中已经验证过的 Harness Efficiency 思路，在 Codex Desktop / CLI 的原生 Plugin 体系里能否被重新实现，并在真实 Coding Task 上降低 Token、Cost、Latency 或模型轮次，同时保持任务质量与 Evidence？

---

## 1.2 非目标

v0.1 不做：

- 模型训练；
- 模型权重修改；
- Recursive Self-Improvement；
- Harness Auto-Research；
- 自动修改 Evaluator；
- 自动发布新 Harness；
- 多 Agent Harness Evolution；
- Enterprise Harness Registry；
- 大规模 Benchmark Platform。

这些属于后续 `SoL-Codex Research` 或 Enterprise Harness Evolution Platform 范围。

---

# 2. 与 SoL-Pi 的关系

SoL-Pi 是设计参考，不是运行依赖。

原则：

```text
Reference implementation
       ↓
Understand mechanism
       ↓
Re-design for Codex lifecycle
       ↓
Native Codex implementation
```

不应：

```text
Codex
 ↓
Run Pi
 ↓
Load SoL-Pi
```

---

## 2.1 四个机制映射

| SoL-Pi Mechanism | Codex 实现建议 | 首版可行性 |
|---|---|---:|
| Action Fusion | `PostToolUse` + Validation Planner + safe runner | 高 |
| ObservationPack | Archive + Handle + MCP recall | 中高 |
| Evidence-Preserving Reducer | `PostToolUse` + local archive + reducer + verifier | 高 |
| Online Context Compact | `PreCompact` / `PostCompact` / `SessionStart(compact)` + state | 中高 |

---

# 3. Codex 当前扩展能力边界

截至 2026-09-19，Codex Plugin 可以组合：

- Skills；
- MCP servers；
- Lifecycle Hooks；
- assets；
- OpenAI-specific plugin configuration。

推荐采用根目录 `plugin.json` 的 Portable Agent Plugins 结构，同时保留 `.codex-plugin/plugin.json` 作为兼容性配置。

Codex Hooks 当前支持：

```text
PreToolUse
PermissionRequest
PostToolUse
PreCompact
PostCompact
UserPromptSubmit
SubagentStart
SubagentStop
Stop
Interrupt
SessionStart
SessionEnd
```

其中最关键：

```text
PreToolUse
PostToolUse
PreCompact
PostCompact
SessionStart
Stop
```

需要特别注意：

> Hooks 是实用的 Runtime Extension Point，不应视为完整安全边界。

另外，当前部分输出替换能力仍有限，例如 `suppressOutput` 会被解析但尚未完整实现。因此 ObservationPack 首版不能依赖“拦截任意 Tool Result 并完全替换其返回值”的假设。

因此本方案采用：

```text
Hook = 观察 / 决策 / 触发
MCP = 可调用的显式能力
Archive = Evidence Source of Truth
```

而不是：

```text
Hook = 完全代理 Codex Runtime
```

---

# 4. 总体架构

```text
┌─────────────────────────────────────────────────────┐
│                    Codex Desktop                    │
│                                                     │
│  Model Loop / Tool Runtime / Session / Compaction   │
└───────────────────────┬─────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│                 SoL-Codex Plugin                    │
│                                                     │
│  Skill                                              │
│  └─ harness-optimizer                               │
│                                                     │
│  Hooks                                              │
│  ├─ SessionStart                                    │
│  ├─ PreToolUse                                      │
│  ├─ PostToolUse                                     │
│  ├─ PreCompact                                      │
│  ├─ PostCompact                                     │
│  └─ Stop                                            │
│                                                     │
│  Core                                               │
│  ├─ Action Fusion                                   │
│  ├─ ObservationPack                                 │
│  ├─ Evidence Reducer                                │
│  └─ Context Compact                                 │
│                                                     │
│  State                                              │
│  ├─ Session State                                   │
│  ├─ Observation Archive                             │
│  ├─ Evidence Ledger                                 │
│  └─ Metrics                                         │
│                                                     │
│  MCP                                                │
│  ├─ obs_get                                         │
│  ├─ obs_slice                                       │
│  ├─ obs_search                                      │
│  ├─ evidence_get                                    │
│  └─ harness_status                                  │
└───────────────────────┬─────────────────────────────┘
                        │
                        ▼
              ${PLUGIN_DATA}/sessions/
```

---

# 5. 推荐技术栈

第一版建议使用：

```text
Language        TypeScript
Runtime         Node.js 22+
Package Manager pnpm
Test            Vitest
Schema          Zod
MCP SDK         @modelcontextprotocol/sdk
CLI             commander / citty（二选一）
Log             pino
Hash            node:crypto
Storage         filesystem + JSONL
```

原因：

1. Plugin/Hook/MCP 都属于本地开发工具场景；
2. TypeScript 与 MCP SDK 配合成熟；
3. Node 适合跨 macOS / Linux；
4. 不需要第一版就引入数据库；
5. SoL-Codex 本身应尽量轻量。

---

# 6. GitHub 仓库结构

推荐直接建立以下结构：

```text
sol-codex/
│
├── plugin.json
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── vitest.config.ts
├── LICENSE
├── README.md
├── SECURITY.md
├── CONTRIBUTING.md
├── CHANGELOG.md
│
├── .codex-plugin/
│   └── plugin.json
│
├── skills/
│   └── harness-optimizer/
│       ├── SKILL.md
│       └── references/
│           ├── mechanisms.md
│           ├── safety.md
│           └── troubleshooting.md
│
├── hooks/
│   ├── hooks.json
│   └── bin/
│       ├── session-start.mjs
│       ├── pre-tool-use.mjs
│       ├── post-tool-use.mjs
│       ├── pre-compact.mjs
│       ├── post-compact.mjs
│       └── stop.mjs
│
├── src/
│   ├── index.ts
│   │
│   ├── config/
│   │   ├── schema.ts
│   │   ├── load.ts
│   │   └── defaults.ts
│   │
│   ├── runtime/
│   │   ├── hook-input.ts
│   │   ├── hook-output.ts
│   │   ├── session.ts
│   │   └── paths.ts
│   │
│   ├── mechanisms/
│   │   ├── action-fusion/
│   │   │   ├── index.ts
│   │   │   ├── detector.ts
│   │   │   ├── planner.ts
│   │   │   ├── runner.ts
│   │   │   └── policy.ts
│   │   │
│   │   ├── observation-pack/
│   │   │   ├── index.ts
│   │   │   ├── archive.ts
│   │   │   ├── ledger.ts
│   │   │   ├── handle.ts
│   │   │   ├── preview.ts
│   │   │   └── recall.ts
│   │   │
│   │   ├── evidence-reducer/
│   │   │   ├── index.ts
│   │   │   ├── eligibility.ts
│   │   │   ├── reducer.ts
│   │   │   ├── receipt.ts
│   │   │   ├── verifier.ts
│   │   │   └── secret-filter.ts
│   │   │
│   │   └── context-compact/
│   │       ├── index.ts
│   │       ├── state.ts
│   │       ├── pressure.ts
│   │       ├── boundary.ts
│   │       ├── summary.ts
│   │       └── restore.ts
│   │
│   ├── storage/
│   │   ├── observation-store.ts
│   │   ├── evidence-store.ts
│   │   ├── session-store.ts
│   │   └── jsonl.ts
│   │
│   ├── metrics/
│   │   ├── events.ts
│   │   ├── counters.ts
│   │   ├── savings.ts
│   │   └── report.ts
│   │
│   ├── mcp/
│   │   ├── server.ts
│   │   ├── tools/
│   │   │   ├── obs-get.ts
│   │   │   ├── obs-slice.ts
│   │   │   ├── obs-search.ts
│   │   │   ├── evidence-get.ts
│   │   │   └── harness-status.ts
│   │   └── schemas.ts
│   │
│   └── cli/
│       ├── main.ts
│       ├── doctor.ts
│       ├── inspect.ts
│       └── report.ts
│
├── scripts/
│   ├── build.mjs
│   ├── install-dev.mjs
│   ├── uninstall-dev.mjs
│   ├── check-plugin.mjs
│   ├── check-hooks.mjs
│   └── benchmark.mjs
│
├── config/
│   ├── sol-codex.example.json
│   └── schema.json
│
├── test/
│   ├── unit/
│   ├── integration/
│   ├── fixtures/
│   └── benchmark/
│
└── docs/
    ├── architecture.md
    ├── mechanisms.md
    ├── configuration.md
    ├── hooks.md
    ├── mcp.md
    ├── security.md
    ├── benchmark.md
    └── compatibility.md
```

---

# 7. plugin.json

推荐采用 Portable Agent Plugins manifest。

初始版本：

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "sol-codex",
  "version": "0.1.0",
  "description": "Harness optimization for Codex: action fusion, observation packing, evidence-preserving reduction, and context compaction.",
  "author": {
    "name": "SoL-Codex Contributors"
  },
  "repository": "https://github.com/<your-org>/sol-codex",
  "license": "MIT",
  "keywords": [
    "codex",
    "agent",
    "harness",
    "optimization",
    "context",
    "mcp"
  ],
  "extensions": {
    "com.openai": {
      "hooks": "./hooks/hooks.json"
    }
  }
}
```

说明：

- 根目录 `skills/` 会按标准结构被发现；
- Hooks 显式指向 `./hooks/hooks.json`；
- MCP 发布方式在 v0.1 中采用“双模式”，见 MCP 章节；
- 不在 manifest 中硬编码 secret；
- 不在 manifest 中硬编码具体模型。

---

# 8. `.codex-plugin/plugin.json`

保留兼容性入口：

```json
{
  "name": "sol-codex",
  "version": "0.1.0",
  "description": "Harness optimization for Codex.",
  "skills": "./skills/",
  "hooks": "./hooks/hooks.json"
}
```

若后续采用兼容格式挂载 MCP：

```json
{
  "name": "sol-codex",
  "version": "0.1.0",
  "description": "Harness optimization for Codex.",
  "skills": "./skills/",
  "hooks": "./hooks/hooks.json",
  "mcpServers": "./.mcp.json"
}
```

建议：

> 根 `plugin.json` 是长期主入口，`.codex-plugin/plugin.json` 只做 Codex 兼容层。

---

# 9. SKILL.md

路径：

```text
skills/harness-optimizer/SKILL.md
```

建议内容：

```markdown
---
name: sol-codex-harness
description: Optimize long-running Codex coding tasks using SoL-Codex harness mechanisms. Use when working on multi-step coding, debugging, refactoring, repository analysis, or test-driven implementation where tool repetition, large logs, or context growth may become expensive.
---

Use SoL-Codex as a harness optimization layer, not as a replacement for task correctness.

Core rules:

1. Preserve correctness before optimizing cost.
2. Never skip required verification to save tokens or time.
3. Treat archived observations and evidence as the source of truth.
4. When a compact receipt is insufficient, retrieve the original evidence through the SoL-Codex MCP tools.
5. Prefer deterministic validation over model judgment when a test, lint, build, diff, hash, or structured parser can verify the result.
6. Do not treat a summary as exact evidence.
7. Do not expose secrets found in logs or archived observations.
8. If an optimization mechanism fails, fall back to native Codex behavior.

Mechanisms:

- Action Fusion: after a safe file mutation, run a predictable validation only when the configured policy clearly maps the mutation to that validation.
- ObservationPack: large eligible observations may be archived and represented by a stable handle. Use `obs_get`, `obs_slice`, or `obs_search` when exact content is needed.
- Evidence-Preserving Reducer: diagnostic logs may be represented as verified receipts. Use the original evidence whenever the receipt is incomplete or verification fails.
- Context Compact: after completed task boundaries or strong context pressure, retain current objective, unresolved issues, critical evidence handles, modified files, verification status, and next actions.

Do not:
- invent archived content;
- assume a validation passed when it did not run;
- bypass permission prompts;
- execute destructive commands through Action Fusion;
- reduce logs that are likely to contain secrets unless the configured local-only policy allows it.
```

---

# 10. Skill 的职责边界

Skill 只负责：

```text
告诉 Codex：
什么时候使用这些机制
如何解释 Handle / Receipt
什么时候应该 Recall 原始 Evidence
什么时候不能为了效率牺牲验证
```

Skill 不负责：

- 监听 Tool；
- 存储 Observation；
- 执行验证命令；
- 触发 Compact；
- 维护 Session State。

这些属于 Hook / Core / MCP。

---

# 11. hooks.json

路径：

```text
hooks/hooks.json
```

建议首版：

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume|compact",
        "hooks": [
          {
            "type": "command",
            "command": "node ${PLUGIN_ROOT}/hooks/bin/session-start.mjs",
            "timeout": 10,
            "statusMessage": "Initializing SoL-Codex"
          }
        ]
      }
    ],

    "PreToolUse": [
      {
        "matcher": "Bash|apply_patch|Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "node ${PLUGIN_ROOT}/hooks/bin/pre-tool-use.mjs",
            "timeout": 10,
            "statusMessage": "Checking harness policy"
          }
        ]
      }
    ],

    "PostToolUse": [
      {
        "matcher": "Bash|apply_patch|Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "node ${PLUGIN_ROOT}/hooks/bin/post-tool-use.mjs",
            "timeout": 60,
            "statusMessage": "Optimizing tool result"
          }
        ]
      }
    ],

    "PreCompact": [
      {
        "matcher": "manual|auto",
        "hooks": [
          {
            "type": "command",
            "command": "node ${PLUGIN_ROOT}/hooks/bin/pre-compact.mjs",
            "timeout": 20,
            "statusMessage": "Saving harness state"
          }
        ]
      }
    ],

    "PostCompact": [
      {
        "matcher": "manual|auto",
        "hooks": [
          {
            "type": "command",
            "command": "node ${PLUGIN_ROOT}/hooks/bin/post-compact.mjs",
            "timeout": 20,
            "statusMessage": "Restoring harness context"
          }
        ]
      }
    ],

    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ${PLUGIN_ROOT}/hooks/bin/stop.mjs",
            "timeout": 30,
            "statusMessage": "Finalizing SoL-Codex session"
          }
        ]
      }
    ]
  }
}
```

---

# 12. Hook Wrapper 设计

`hooks/bin/*.mjs` 不放业务逻辑。

每个 wrapper 只做：

```text
stdin JSON
   ↓
parse
   ↓
call core
   ↓
stdout JSON
```

例如：

```js
#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { handlePostToolUse } from "../../dist/runtime/post-tool-use.js";

const input = JSON.parse(await readFile(0, "utf8"));
const output = await handlePostToolUse(input);

if (output) {
  process.stdout.write(JSON.stringify(output));
}
```

生产发布时建议 hook wrapper 引用 `dist/`。

不要在 Hook 文件中：

- 写复杂 regex；
- 直接 shell 拼接；
- 直接调用远程 LLM；
- 自己实现 storage；
- 读取不稳定 transcript 格式作为核心接口。

---

# 13. 配置文件

建议插件配置：

```text
~/.config/sol-codex/config.json
```

项目级可选：

```text
<repo>/.sol-codex.json
```

首版建议：

```json
{
  "version": 1,

  "actionFusion": {
    "enabled": true,
    "mode": "conservative"
  },

  "observationPack": {
    "enabled": true,
    "thresholdBytes": 10240,
    "previewBytes": 1200,
    "retainRecent": 2
  },

  "evidenceReducer": {
    "enabled": false,
    "mode": "local-only",
    "thresholdBytes": 20000
  },

  "contextCompact": {
    "enabled": true,
    "mode": "boundary-aware"
  },

  "storage": {
    "retentionDays": 7
  },

  "metrics": {
    "enabled": true
  }
}
```

默认原则：

```text
Action Fusion            ON
ObservationPack          ON
Evidence Reducer         OFF
Online Context Compact   OFF / conservative
```

更激进的机制必须显式开启。

---

# 14. Session Storage

Codex Plugin 会提供：

```text
PLUGIN_DATA
```

因此使用：

```text
${PLUGIN_DATA}/sessions/<session-id>/
```

结构：

```text
sessions/<session-id>/
│
├── state.json
├── metrics.jsonl
├── observations/
│   ├── obs_01J...txt
│   ├── obs_02J...json
│   └── ledger.jsonl
│
├── evidence/
│   ├── ev_01J...log
│   └── ledger.jsonl
│
├── compact/
│   ├── checkpoint.json
│   └── history.jsonl
│
└── action-fusion/
    └── events.jsonl
```

---

# 15. 稳定 Handle

Observation / Evidence 不使用文件名作为模型接口。

统一生成：

```text
obs://<session>/<id>
evidence://<session>/<id>
```

例如：

```text
obs://01J9XYZ/01J9ABC
```

Handle 对模型稳定。

真实路径属于内部实现。

---

# 16. Mechanism 1 — Action Fusion

## 16.1 目标

减少这种模式：

```text
Codex
 ↓
apply_patch
 ↓
模型重新推理
 ↓
Bash: npm test
```

如果后续动作高度可预测：

```text
apply_patch
 ↓
deterministic validation
```

则可以在 Harness 层触发验证。

---

## 16.2 重要限制

不要实现：

```text
看到任何 Edit
↓
直接 npm test
```

正确设计：

```text
Mutation
 ↓
Changed files
 ↓
Project detector
 ↓
Validation policy
 ↓
Safe candidate
 ↓
Run
```

---

## 16.3 Validation Policy

例：

```yaml
rules:
  - match:
      files: ["src/**/*.ts"]
    run:
      - "pnpm lint"
      - "pnpm test --changed"

  - match:
      files: ["*.py", "src/**/*.py"]
    run:
      - "ruff check"
      - "pytest --last-failed"

  - match:
      files: ["go.mod", "**/*.go"]
    run:
      - "go test ./..."
```

第一版不要自动生成 shell。

只允许：

> Configured deterministic command。

---

## 16.4 detector.ts

职责：

```text
tool_name
tool_input
cwd
 ↓
identify mutation
 ↓
changed path
```

输出：

```ts
type Mutation = {
  toolUseId: string;
  path: string;
  kind: "create" | "edit" | "delete";
};
```

---

## 16.5 planner.ts

```ts
type ValidationPlan = {
  commands: Array<{
    command: string;
    timeoutMs: number;
  }>;
  reason: string;
};
```

输入：

```text
Mutation[]
Project Metadata
Policy
```

输出：

```text
ValidationPlan | null
```

---

## 16.6 runner.ts

要求：

- 不使用 `shell: true` 拼接不受控参数；
- command 白名单；
- cwd 固定为 session cwd；
- timeout；
- stdout/stderr size cap；
- exit code 保存；
- 结果进入 ObservationPack。

---

## 16.7 MVP

首版只实现：

```text
apply_patch / Edit / Write
        ↓
changed file type
        ↓
configured validation
```

不要先做自动学习验证命令。

---

# 17. Mechanism 2 — ObservationPack

这是 SoL-Codex 最关键的一部分。

## 17.1 问题

Coding Agent 常见：

```text
grep / test / build / git diff / logs
            ↓
       50KB - 500KB
            ↓
     repeated in context
```

ObservationPack 目标：

```text
Large Result
   ↓
Archive Original
   ↓
Generate Handle
   ↓
Preview
   ↓
Exact Recall on Demand
```

---

# 18. Observation Archive

每个 observation：

```json
{
  "id": "obs_01J...",
  "sessionId": "01J...",
  "tool": "Bash",
  "createdAt": "...",
  "contentType": "text/plain",
  "size": 82319,
  "sha256": "...",
  "path": "...",
  "preview": "...",
  "sourceToolUseId": "..."
}
```

---

# 19. 为什么必须保留原文

原则：

```text
Summary != Evidence
```

必须做到：

```text
Receipt
 ↓
Handle
 ↓
Original
```

任何时候都可精确返回原文。

---

# 20. ObservationPack 与 Codex Hook 的实现策略

当前不要假设 `PostToolUse` 能稳定、全面地把所有原始工具输出替换成任意自定义内容。

因此 v0.1 使用渐进方案：

### Mode A — Passive Archive

```text
PostToolUse
 ↓
detect large eligible result
 ↓
archive
 ↓
store metrics
```

不改变 Codex 原始行为。

用途：

- 建立基线；
- 测试 archive；
- 测量潜在 replay waste。

### Mode B — MCP-aware Recall

Skill 告诉 Codex：

> 当收到 `obs://...` handle 时，使用 MCP 精确取回。

### Mode C — Selective Context Injection

对于 Hook 支持 `additionalContext` 的位置，可注入：

```text
Large evidence archived as obs://...
Use SoL-Codex MCP for exact recall.
```

首版不以“强制替换全部 tool result”为验收前提。

---

# 21. ObservationPack MCP Tools

建议工具：

## `obs_get`

输入：

```json
{
  "handle": "obs://session/id"
}
```

用途：

- 小 Observation；
- 获取 metadata + preview。

---

## `obs_slice`

输入：

```json
{
  "handle": "obs://session/id",
  "offset": 0,
  "limit": 12000
}
```

返回精确 byte / char range。

---

## `obs_search`

输入：

```json
{
  "handle": "obs://session/id",
  "query": "AssertionError",
  "maxMatches": 20
}
```

不使用 LLM。

使用 exact / substring / regex-safe search。

---

# 22. Mechanism 3 — Evidence-Preserving Reducer

## 22.1 问题

大日志中真正影响下一步的内容可能只有：

```text
command
exit code
error
stack
failing test
critical lines
```

而主模型可能需要阅读数十 KB。

---

## 22.2 核心原则

Reducer 可以压缩，但必须证明：

> Receipt 中每个 quote 都来自原始 Evidence。

---

# 23. Receipt Schema

```ts
type EvidenceReceipt = {
  evidenceHandle: string;
  sourceSha256: string;

  command?: string;
  exitCode?: number;

  summary: string;

  quotes: Array<{
    text: string;
    start: number;
    end: number;
  }>;

  tags: string[];

  verified: boolean;
};
```

---

# 24. Reducer Pipeline

```text
Raw Log
  ↓
Secret Filter
  ↓
Archive
  ↓
Eligibility
  ↓
Reducer
  ↓
Structured Receipt
  ↓
Schema Validation
  ↓
Source Hash Validation
  ↓
Exact Quote Validation
  ↓
Size Validation
  ↓
PASS → Receipt
FAIL → Original
```

---

# 25. Reducer 模式

首版提供三种：

```text
off
local-only
remote
```

默认：

```text
off
```

---

## 25.1 local-only

不调用外部模型。

通过 deterministic parser 提取：

- exit code；
- stderr tail；
- stack traces；
- test failures；
- compiler errors；
- known error patterns。

建议首版先做好这个模式。

---

## 25.2 remote

后续才开放。

要求：

- 显式 opt-in；
- secret filter；
- provider 配置；
- 原始 log 本地保存；
- reducer failure fallback；
- remote data warning。

---

# 26. Exact Quote Verifier

核心算法：

```ts
for (const quote of receipt.quotes) {
  const exact = source.slice(quote.start, quote.end);

  if (exact !== quote.text) {
    return FAIL;
  }
}
```

同时验证：

```text
sha256(source) == receipt.sourceSha256
```

任何失败：

```text
use original observation
```

---

# 27. Secret Filter

初版至少检测：

- OpenAI key；
- GitHub token；
- AWS key；
- bearer token；
- private key block；
- common password assignment；
- JWT-like token；
- `.env` line patterns。

注意：

> secret detector 只是风险缓解，不是完整 DLP。

因此默认 remote reducer 为 OFF。

---

# 28. Mechanism 4 — Online Context Compact

这是四个机制中最容易被误做的一项。

首版不要尝试自己取代 Codex native compaction。

正确目标：

> 在 Codex 发生 compaction 前后，保存和恢复 Harness-critical state。

---

# 29. Context State

保存：

```ts
type CompactCheckpoint = {
  objective: string | null;

  completedSteps: string[];
  pendingSteps: string[];

  modifiedFiles: string[];

  verification: Array<{
    name: string;
    status: "pass" | "fail" | "unknown";
  }>;

  observationHandles: string[];
  evidenceHandles: string[];

  unresolvedIssues: string[];
  nextActions: string[];

  timestamp: string;
};
```

---

# 30. Hook 映射

## `PreCompact`

执行：

```text
capture compact-critical state
 ↓
write checkpoint
```

---

## `PostCompact`

执行：

```text
validate checkpoint
 ↓
prepare concise restoration context
```

---

## `SessionStart(compact)`

如果 Codex 新 session source 为 compact：

```text
read latest checkpoint
 ↓
inject additionalContext
```

内容限制：

```text
Objective
Current status
Modified files
Verification state
Critical handles
Unresolved issues
Next action
```

不恢复：

- 大段历史日志；
- 已完成详细 reasoning；
- 全量 tool result。

---

# 31. Compact Policy

v0.1 不主动决定何时强制 compact。

只做：

```text
Native Codex Compact
+
State Preservation
```

v0.2 再研究：

```text
Boundary-aware compact recommendation
```

例如：

```text
Plan step finished
AND
context pressure high
AND
recovery state complete
```

---

# 32. MCP Server

## 32.1 MCP 的角色

SoL-Codex MCP 不是业务连接器。

它是 Harness Runtime 的：

> Evidence / Observation Access API。

---

## 32.2 MCP Tool List

v0.1：

```text
obs_get
obs_slice
obs_search
evidence_get
harness_status
```

v0.2：

```text
metrics_report
compact_checkpoint
session_inspect
```

---

# 33. MCP Server Skeleton

`src/mcp/server.ts`：

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const server = new McpServer(
  {
    name: "sol-codex",
    version: "0.1.0"
  },
  {
    instructions:
      "Use these tools to retrieve exact archived observations and evidence created by SoL-Codex. Treat archived source content as authoritative over summaries."
  }
);

// register obs_get
// register obs_slice
// register obs_search
// register evidence_get
// register harness_status

export { server };
```

---

# 34. MCP 配置策略

这里建议明确区分：

## Local Development

Codex Desktop / CLI 本身支持 STDIO MCP。

开发阶段使用：

```text
Codex config.toml
       ↓
node dist/mcp/server.js
```

通过 `scripts/install-dev.mjs` 自动写入/提示配置。

示意：

```toml
[mcp_servers.sol_codex]
command = "node"
args = ["/absolute/path/to/sol-codex/dist/mcp/server.js"]
cwd = "/absolute/path/to/sol-codex"
```

---

## Portable / Published Plugin

Portable `mcp.json` 推荐使用 Streamable HTTP：

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
  "mcpServers": {
    "sol_codex": {
      "type": "streamable-http",
      "url": "https://<host>/mcp"
    }
  }
}
```

但 SoL-Codex 的 Observation Store 是本地 session 数据，因此第一阶段**不建议为了发布强行把 Evidence 上传到远端 MCP**。

因此 v0.1 GitHub 项目的推荐状态：

```text
Plugin + Hooks = core
Local STDIO MCP = dev / Codex Desktop mode
Remote MCP = optional future mode
```

这比为了满足“Portable Plugin”而上传本地日志更符合安全模型。

---

# 35. `harness_status`

用于检查运行状态：

输入：

```json
{}
```

返回：

```json
{
  "session": "...",
  "mechanisms": {
    "actionFusion": true,
    "observationPack": true,
    "evidenceReducer": false,
    "contextCompact": true
  },
  "observations": 12,
  "archivedBytes": 912331,
  "fusedValidations": 4
}
```

这也是调试入口。

---

# 36. Runtime Event Flow

完整执行链：

```text
SessionStart
    ↓
load config
    ↓
initialize state
    ↓

User Task
    ↓
Codex reasoning
    ↓
PreToolUse
    ├─ safety checks
    └─ collect metadata
    ↓
Tool execution
    ↓
PostToolUse
    ├─ ObservationPack archive
    ├─ Evidence Reducer
    ├─ Action Fusion candidate
    └─ metrics
    ↓
Codex continues
    ↓
PreCompact
    └─ checkpoint
    ↓
Codex compact
    ↓
PostCompact
    ↓
SessionStart(compact)
    └─ restore minimal state
    ↓
Continue
    ↓
Stop
    ├─ finalize metrics
    └─ report
```

---

# 37. Hook Input Adapter

不要让 mechanism 直接依赖 Codex 原始 Hook JSON。

统一：

```ts
type HookContext = {
  sessionId: string;
  turnId?: string;
  cwd: string;
  model?: string;
  event: string;
  permissionMode?: string;
};

type ToolEvent = HookContext & {
  toolName: string;
  toolUseId: string;
  toolInput: unknown;
  toolOutput?: unknown;
};
```

以后 Codex Hook Schema 变化，只改 Adapter。

---

# 38. SoL-Codex Core API

建议：

```ts
export interface HarnessMechanism {
  name: string;

  onSessionStart?(ctx: SessionContext): Promise<void>;

  onPreToolUse?(
    event: ToolEvent
  ): Promise<HookDecision | void>;

  onPostToolUse?(
    event: ToolEvent
  ): Promise<HookDecision | void>;

  onPreCompact?(
    event: CompactEvent
  ): Promise<void>;

  onPostCompact?(
    event: CompactEvent
  ): Promise<HookDecision | void>;

  onStop?(
    ctx: SessionContext
  ): Promise<void>;
}
```

这样四个机制是独立模块。

---

# 39. Fallback First

每个机制都必须遵守：

```text
Optimization Failure
       ↓
Native Codex Behavior
```

绝不能：

```text
Optimization Failure
       ↓
Task Failure
```

例如：

```text
Reducer failed
→ return original

Archive failed
→ do not replace / annotate

Action fusion validation unavailable
→ Codex decides normally

Checkpoint invalid
→ ignore checkpoint
```

---

# 40. Metrics

必须从 Day 1 设计，不然后面无法证明有效。

事件：

```ts
type HarnessMetric =
  | { type: "observation_archived"; bytes: number }
  | { type: "observation_recalled"; bytes: number }
  | { type: "action_fused"; command: string }
  | { type: "reducer_success"; before: number; after: number }
  | { type: "reducer_fallback"; reason: string }
  | { type: "compact_checkpoint"; size: number };
```

---

# 41. 第一阶段可测指标

不要一开始追求精确 API Cost。

先测：

```text
Model turns / task
Tool calls / task
Large observation bytes
Archived bytes
Recalled bytes
Reducer compression ratio
Fused validation count
Task success
Test pass
Wall time
```

如果 Codex 能暴露 usage，再增加：

```text
Input Tokens
Output Tokens
Cached Tokens
```

---

# 42. Savings Estimator

首版只叫：

```text
Estimated Savings
```

不要叫：

```text
Saved API Cost
```

除非能获得真实 provider usage。

公式可以记录：

```text
estimated_avoided_observation_bytes
estimated_avoided_turns
```

不要伪造 Token 精确换算。

---

# 43. 安全设计

## 43.1 Action Fusion

禁止自动执行：

```text
rm
sudo
git push
git reset --hard
docker system prune
kubectl delete
terraform apply
database mutation
network mutation
```

默认只允许本地 validation。

---

## 43.2 Archive

Archive 权限：

```text
0700 directory
0600 files
```

如平台允许，应实现。

---

## 43.3 Symlink

保存外部 tool log 时：

- 必须 resolve；
- 拒绝 symlink；
- 限定 regular file；
- 限定允许目录；
- size cap。

---

## 43.4 Remote Reducer

必须显式：

```text
remoteReducer.enabled = true
```

并在文档中说明：

> diagnostic data may leave local machine.

---

# 44. README 首屏建议

```markdown
# SoL-Codex

Harness efficiency mechanisms for Codex.

SoL-Codex brings four RSI-inspired harness optimization ideas to Codex:

- Action Fusion
- ObservationPack
- Evidence-Preserving Reducer
- Context Compact

It does not modify Codex itself and does not train or alter the underlying model.

Goals:
- fewer redundant model turns
- less repeated context traffic
- exact evidence recall
- safer context compaction

Status: experimental.
```

随后马上写：

```text
Correctness > Efficiency
Evidence > Summary
Fallback > Failure
Opt-in > Surprise
```

---

# 45. GitHub Topics

建议：

```text
codex
openai-codex
agent-harness
coding-agent
mcp
agent-optimization
context-engineering
agentic-engineering
```

---

# 46. License

SoL-Pi 本身为 MIT License。

如果 SoL-Codex：

- 只参考论文与机制；
- 自己实现 Codex-specific code；

建议也采用：

```text
MIT
```

README 明确：

> Inspired by SoL-Pi. SoL-Codex is an independent implementation for Codex and is not affiliated with NVIDIA or OpenAI.

如果直接复制 SoL-Pi 代码片段，则必须保留对应版权与 MIT attribution。

更推荐：

> clean reimplementation。

---

# 47. Branch Strategy

首版：

```text
main
develop
feature/action-fusion
feature/observation-pack
feature/evidence-reducer
feature/context-compact
feature/mcp
```

GitHub 开源项目不需要复杂 GitFlow。

如果一人开发：

```text
main
feature/*
```

已经足够。

---

# 48. GitHub Issues / Milestones

## Milestone M0 — Plugin boots

Issues：

```text
#1 Initialize TypeScript project
#2 Add portable plugin.json
#3 Add .codex-plugin compatibility manifest
#4 Add SKILL.md
#5 Add hooks.json
#6 Implement hook wrappers
#7 Implement config loader
#8 Add doctor command
```

验收：

```text
Codex detects plugin
Skill visible
Hooks trusted
SessionStart runs
No behavior changes
```

---

# 49. Milestone M1 — Observation Foundation

Issues：

```text
#9 Session store
#10 Stable observation handles
#11 Observation archive
#12 Ledger
#13 obs_get MCP
#14 obs_slice MCP
#15 obs_search MCP
#16 harness_status MCP
```

验收：

```text
large result
→ archive
→ handle
→ exact recall
→ hash matches
```

---

# 50. Milestone M2 — Action Fusion

Issues：

```text
#17 Project detector
#18 Validation policy schema
#19 Mutation detector
#20 Validation planner
#21 Safe runner
#22 PostToolUse integration
#23 Fusion metrics
```

验收：

```text
edit
→ predictable validation
→ result archived
→ zero unsafe command
```

---

# 51. Milestone M3 — Evidence Reducer

Issues：

```text
#24 Eligibility
#25 Secret detector
#26 deterministic reducer
#27 receipt schema
#28 exact quote verifier
#29 reducer fallback
#30 MCP evidence_get
```

验收：

```text
receipt quote
== exact source quote
```

失败必须：

```text
fallback original
```

---

# 52. Milestone M4 — Context Compact

Issues：

```text
#31 Compact checkpoint schema
#32 PreCompact checkpoint
#33 PostCompact restore
#34 SessionStart compact restore
#35 checkpoint validation
```

验收：

压缩后能够恢复：

```text
Objective
Modified Files
Pending Work
Verification Status
Critical Evidence Handles
```

---

# 53. Milestone M5 — Benchmark

建立小型 benchmark：

```text
20-50 tasks
```

任务类别：

```text
Bug Fix
Refactor
Feature
Test Failure
Large Log Diagnosis
Repository Exploration
```

每个任务：

```text
Baseline Codex
vs
Codex + SoL-Codex
```

---

# 54. Benchmark 指标

主指标：

```text
Task Success
Test Pass
```

约束：

```text
不得下降超过设定 tolerance
```

效率指标：

```text
Turns
Tool Calls
Wall Time
Large Observation Traffic
Token Usage（若可得）
```

---

# 55. A/B 测试设计

避免：

```text
SoL-Codex 开启后
随便跑几个项目
感觉快了
```

正确做：

```text
Task Set Frozen
Repo Revision Frozen
Environment Frozen

Run A:
Native Codex

Run B:
Codex + SoL-Codex
```

至少记录：

```text
task_id
repo_sha
model
codex_version
plugin_version
config_hash
outcome
```

---

# 56. Feature Flags

所有机制独立：

```json
{
  "actionFusion": true,
  "observationPack": true,
  "evidenceReducer": false,
  "contextCompact": false
}
```

必须支持：

```text
all off
single mechanism
all enabled
```

方便做 ablation。

---

# 57. CLI

建议提供：

```bash
sol-codex doctor
sol-codex inspect
sol-codex status
sol-codex report
```

---

## `doctor`

检查：

```text
Node version
Codex availability
Plugin paths
Hook executable
PLUGIN_DATA writable
MCP connectivity
Config validity
```

---

## `inspect`

```bash
sol-codex inspect <session-id>
```

显示：

```text
observations
evidence
action fusion
compact history
```

---

## `report`

```bash
sol-codex report <session-id>
```

输出：

```text
Task metrics
Archived bytes
Recall bytes
Fusion events
Reducer ratio
Fallbacks
```

---

# 58. package.json 建议

```json
{
  "name": "sol-codex",
  "version": "0.1.0",
  "type": "module",
  "private": false,
  "bin": {
    "sol-codex": "./dist/cli/main.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "check": "pnpm lint && pnpm test && pnpm build",
    "doctor": "node dist/cli/main.js doctor"
  },
  "engines": {
    "node": ">=22"
  }
}
```

---

# 59. Config Schema

使用 Zod：

```ts
const ConfigSchema = z.object({
  version: z.literal(1),

  actionFusion: z.object({
    enabled: z.boolean(),
    mode: z.enum(["conservative"])
  }),

  observationPack: z.object({
    enabled: z.boolean(),
    thresholdBytes: z.number().int().positive(),
    previewBytes: z.number().int().positive(),
    retainRecent: z.number().int().nonnegative()
  }),

  evidenceReducer: z.object({
    enabled: z.boolean(),
    mode: z.enum(["local-only", "remote"]),
    thresholdBytes: z.number().int().positive()
  }),

  contextCompact: z.object({
    enabled: z.boolean(),
    mode: z.enum(["native-only", "boundary-aware"])
  })
});
```

未知字段建议：

```text
reject
```

而不是静默忽略。

---

# 60. Storage API

```ts
interface ObservationStore {
  put(input: {
    sessionId: string;
    toolUseId?: string;
    content: string | Uint8Array;
    contentType: string;
  }): Promise<ObservationRecord>;

  get(handle: string): Promise<ObservationRecord>;

  read(
    handle: string,
    offset: number,
    limit: number
  ): Promise<Uint8Array>;

  search(
    handle: string,
    query: string,
    maxMatches: number
  ): Promise<SearchMatch[]>;
}
```

---

# 61. Hash First

保存时：

```text
bytes
 ↓
sha256
 ↓
write file
 ↓
ledger
```

读取时可以选择再次验证。

Evidence Reducer 必须验证。

---

# 62. JSONL Ledger

Example：

```json
{"id":"obs_01","sha256":"...","bytes":12031,"tool":"Bash","createdAt":"..."}
{"id":"obs_02","sha256":"...","bytes":92311,"tool":"Bash","createdAt":"..."}
```

优点：

- append-only；
- 简单；
- 可审计；
- 不需要数据库。

---

# 63. 初版不要上 SQLite

v0.1：

```text
Filesystem + JSONL
```

已经足够。

当需要：

```text
thousands of sessions
full-text query
cross-session analytics
```

再考虑 SQLite / DuckDB。

---

# 64. Error Taxonomy

统一错误：

```text
CONFIG_INVALID
ARCHIVE_FAILED
HANDLE_NOT_FOUND
HASH_MISMATCH
REDUCER_INELIGIBLE
REDUCER_SECRET_RISK
REDUCER_VERIFY_FAILED
FUSION_NO_POLICY
FUSION_UNSAFE_COMMAND
COMPACT_STATE_INVALID
MCP_UNAVAILABLE
```

---

# 65. Logging

默认：

```text
INFO:
mechanism status
metrics

DEBUG:
decision details

NEVER:
raw secret
full sensitive observation
```

---

# 66. Compatibility

建立：

```text
docs/compatibility.md
```

记录：

```text
Codex version
Hook events tested
MCP transport tested
Desktop tested
CLI tested
OS tested
Node version
```

Example：

```text
| Version | Desktop | CLI | Hooks | MCP | Status |
|---|---|---|---|---|---|
| x.y.z | macOS | yes | yes | stdio | tested |
```

不要写：

```text
latest supported
```

必须写具体版本。

---

# 67. Test Strategy

## Unit

测试：

```text
hash
archive
handle
range
search
receipt verifier
secret filter
validation planner
config
```

---

## Integration

测试：

```text
Hook JSON
→ Core
→ Store
→ Hook Output
```

以及：

```text
MCP
→ Store
→ exact source
```

---

## Golden Test

Reducer：

```text
input log
→ expected receipt
```

并验证：

```text
all quotes exact
```

---

## Security Test

覆盖：

```text
symlink
path traversal
oversized input
shell injection
secret pattern
invalid handle
hash mismatch
```

---

# 68. First PR Sequence

建议真正开仓后按下面顺序提交：

```text
PR #1  scaffold + plugin manifests + docs
PR #2  hook runtime + config
PR #3  session storage + metrics
PR #4  observation archive + MCP recall
PR #5  action fusion
PR #6  deterministic evidence reducer
PR #7  compact checkpoint
PR #8  integration benchmark
```

这样每个 PR 都可独立 review。

---

# 69. 第一周目标

## Day 1

```text
repo scaffold
plugin.json
SKILL.md
hooks.json
build pipeline
```

## Day 2

```text
hook adapters
SessionStart
PostToolUse
PLUGIN_DATA
```

## Day 3

```text
Observation Store
Handle
Hash
Ledger
```

## Day 4

```text
MCP obs_get
obs_slice
obs_search
```

## Day 5

```text
large Bash output fixture
exact recall integration test
```

第一周完成后即拥有第一个可演示闭环：

```text
Codex Tool Result
    ↓
SoL-Codex Archive
    ↓
Stable Handle
    ↓
MCP Exact Recall
```

---

# 70. 第二阶段目标

接下来：

```text
Action Fusion
 ↓
Evidence Reducer
 ↓
Context Checkpoint
 ↓
Benchmark
```

不要同时四线开发。

优先顺序建议：

```text
ObservationPack
   ↓
Action Fusion
   ↓
Evidence Reducer
   ↓
Context Compact
```

原因：

1. Observation Store 是 Reducer 基础；
2. Observation Store 也是未来 Trajectory 基础；
3. Action Fusion 独立、容易验证；
4. Reducer 风险高于 Archive；
5. Compact 最依赖 Codex Runtime 行为，应最后实现。

---

# 71. MVP Definition of Done

v0.1.0 发布条件：

## Plugin

- Codex 可发现；
- Skill 可发现；
- Hooks 可加载；
- Hook trust 流程明确。

## ObservationPack

- 大 Observation 可归档；
- hash；
- stable handle；
- exact recall；
- range；
- search。

## Action Fusion

- 至少支持 2 类项目；
- 仅 configured validation；
- unsafe command impossible by default。

## Reducer

- deterministic local reducer；
- exact quote verification；
- failure fallback。

## Context

- compact checkpoint；
- compact 后恢复关键状态。

## Quality

- unit tests；
- integration tests；
- security tests；
- benchmark baseline。

---

# 72. v0.1 不应承诺的事情

README 明确写：

```text
SoL-Codex does not guarantee lower cost on every task.
SoL-Codex does not alter the underlying Codex model.
SoL-Codex is not a sandbox.
SoL-Codex is not a complete security boundary.
SoL-Codex is not recursive self-improvement.
```

---

# 73. 后续 v0.2

增加：

```text
Project auto-detection
Adaptive fusion policies
Better Observation projection
Remote reducer opt-in
Context pressure estimator
Benchmark harness
```

---

# 74. 后续 v0.3

开始形成 Harness Experiment 层：

```text
Native
vs
Mechanism A
vs
Mechanism B
```

自动产出：

```text
quality
turns
tokens
latency
archive/replay
```

---

# 75. 后续 v1.0

真正可以升级为：

> Codex Harness Optimization Framework

增加：

```text
HarnessSpec
Experiment Registry
Trajectory Export
Mechanism SDK
Third-party mechanism API
```

这样其他开发者可以写：

```ts
class MyHarnessMechanism
  implements HarnessMechanism
```

---

# 76. 与 Enterprise Harness Evolution Platform 的关系

SoL-Codex 是：

```text
Runtime-level PoC
```

未来：

```text
              Enterprise Harness Evolution
                        │
                  HarnessSpec
                        │
              Experiment / Evaluation
                        │
         ┌──────────────┼──────────────┐
         ▼              ▼              ▼
     SoL-Codex     Claude Adapter   OpenHands
```

因此现在设计时就要保证：

```text
Mechanism Core
    ≠
Codex Hook Schema
```

通过 Adapter 解耦。

---

# 77. 最重要的架构决策

## ADR-001

SoL-Codex 不修改 Codex 本体。

## ADR-002

Skill 只负责行为指导，不承载 Runtime Optimization。

## ADR-003

Hook 负责生命周期观察与触发，不作为完整代理层。

## ADR-004

Observation 原文是 Source of Truth。

## ADR-005

Reducer 只能生成可验证 Receipt。

## ADR-006

任何优化失败均回退到 Native Codex。

## ADR-007

MCP 用于精确 Evidence Recall，而不是把企业业务能力塞进项目。

## ADR-008

第一版优先 Local STDIO MCP，不强迫本地 Evidence 上云。

## ADR-009

四个机制全部 Feature Flag。

## ADR-010

Quality / Verification 优先于 Token Savings。

---

# 78. 推荐初始 GitHub Description

```text
RSI-inspired harness optimization for Codex: action fusion, observation packing, evidence-preserving reduction, and context compaction.
```

---

# 79. 推荐项目 Tagline

```text
Make Codex loops leaner without hiding the work.
```

或者更技术化：

```text
A harness optimization layer for long-running Codex agents.
```

推荐第二个。

---

# 80. 最终 MVP 架构

```text
                     Codex Desktop
                          │
                          ▼
                 Lifecycle Hooks
                          │
          ┌───────────────┼──────────────┐
          │               │              │
          ▼               ▼              ▼
     Tool Events      Compaction     Session
          │               │              │
          ▼               ▼              ▼
   Action Fusion     Compact State   Metrics
          │
          ▼
   Observation Pipeline
          │
      ┌───┴──────────┐
      ▼              ▼
 Observation      Evidence
 Archive          Reducer
      │              │
      └──────┬───────┘
             ▼
       Stable Handles
             │
             ▼
        Local MCP
             │
             ▼
          Codex
```

---

# 81. 建议现在直接开仓的最小文件集合

如果今天立刻创建 GitHub 仓库，第一批文件不要超过这些：

```text
sol-codex/
├── plugin.json
├── .codex-plugin/plugin.json
├── package.json
├── tsconfig.json
├── README.md
├── LICENSE
├── SECURITY.md
│
├── skills/
│   └── harness-optimizer/
│       └── SKILL.md
│
├── hooks/
│   ├── hooks.json
│   └── bin/
│       ├── session-start.mjs
│       ├── post-tool-use.mjs
│       ├── pre-compact.mjs
│       ├── post-compact.mjs
│       └── stop.mjs
│
├── src/
│   ├── config/
│   ├── runtime/
│   ├── storage/
│   ├── mechanisms/
│   │   └── observation-pack/
│   ├── mcp/
│   └── cli/
│
└── test/
```

先只打通：

```text
Plugin
→ Hook
→ Archive
→ MCP Recall
```

然后再加入其他三个机制。

---

# 82. 第一条 End-to-End User Story

```text
Given:
Codex 正在分析一个产生 80KB test log 的任务

When:
PostToolUse 捕获可归档结果

Then:
SoL-Codex 保存原始日志
生成 sha256
创建稳定 handle

And:
Codex 可以调用 obs_search(handle, "FAILED")

And:
Codex 可以调用 obs_slice(handle, offset, limit)

And:
返回内容与原始日志逐字一致

And:
关闭 SoL-Codex 后 Codex 仍可以按原生方式完成任务
```

如果这个 User Story 先跑通，这个仓库就已经成立。

---

# 83. 第一条 Benchmark Hypothesis

不要一开始写：

> SoL-Codex 会降低 50% Token。

第一条可检验假设应该是：

> 对包含大型重复工具输出的 Coding Task，SoL-Codex ObservationPack 能减少重复进入 Agent 工作集的 Observation 量，同时不降低任务成功率，并保持原始 Evidence 可精确取回。

这是一个工程上可验证、不会夸大的起点。

---

# 84. 参考资料

## OpenAI / Codex

- Plugin Architecture  
  https://developers.openai.com/plugins/concepts/plugins

- Packaging Plugins  
  https://developers.openai.com/plugins/build/plugins

- Skills  
  https://developers.openai.com/plugins/build/skills

- Codex Hooks  
  https://developers.openai.com/docs/hooks

- MCP in Codex  
  https://developers.openai.com/docs/extend/mcp

## SoL-Pi

- GitHub  
  https://github.com/NVlabs/SoL-Pi

- Paper  
  https://arxiv.org/abs/2609.20519

---

# 85. 推荐实施结论

如果 SoL-Codex 作为整个 Enterprise Harness Evolution 路线的第一个 GitHub 项目，建议不要一开始追求完整四机制同时可用。

正确切入顺序：

```text
v0.0.1
Plugin Skeleton

   ↓

v0.0.2
Hook Runtime

   ↓

v0.0.3
Observation Archive

   ↓

v0.0.4
MCP Exact Recall

   ↓

v0.0.5
Action Fusion

   ↓

v0.0.6
Evidence Reducer

   ↓

v0.0.7
Compact Checkpoint

   ↓

v0.1.0
Four-mechanism Experimental Release
```

其中真正的第一个技术里程碑不是：

> 四个机制全部完成。

而是：

> **第一次在 Codex Desktop 中打通 Hook → Evidence Archive → Stable Handle → MCP Exact Recall。**

因为这个链路同时奠定：

- ObservationPack；
- Evidence Reducer；
- Trajectory；
- 后续 Harness Evolution；

四条能力的共同底座。

---

# Appendix A — 建议的 `sol-codex.example.json`

```json
{
  "version": 1,
  "actionFusion": {
    "enabled": true,
    "mode": "conservative"
  },
  "observationPack": {
    "enabled": true,
    "thresholdBytes": 10240,
    "previewBytes": 1200,
    "retainRecent": 2
  },
  "evidenceReducer": {
    "enabled": false,
    "mode": "local-only",
    "thresholdBytes": 20000
  },
  "contextCompact": {
    "enabled": false,
    "mode": "native-only"
  },
  "storage": {
    "retentionDays": 7
  },
  "metrics": {
    "enabled": true
  }
}
```

---

# Appendix B — 推荐 Issue Labels

```text
area:plugin
area:hooks
area:mcp
area:storage
area:action-fusion
area:observation-pack
area:evidence-reducer
area:context
area:benchmark

type:feature
type:bug
type:security
type:docs
type:test
type:refactor

priority:p0
priority:p1
priority:p2

status:blocked
status:ready
status:research
```

---

# Appendix C — Release Gate

发布 `v0.1.0` 前必须满足：

```text
[ ] Plugin loads in tested Codex Desktop version
[ ] Plugin loads in tested Codex CLI version
[ ] Hook trust procedure documented
[ ] All features can be independently disabled
[ ] Observation exact-recall tests pass
[ ] Path traversal tests pass
[ ] Symlink tests pass
[ ] Action Fusion cannot run arbitrary model-generated shell
[ ] Reducer exact quote verification passes
[ ] Reducer failure falls back to original
[ ] Compact checkpoint survives native compaction
[ ] No secrets are written to normal logs
[ ] SECURITY.md complete
[ ] Benchmark baseline published
[ ] Compatibility matrix uses exact tested versions
```

---

# Appendix D — 项目演进方向

```text
SoL-Codex v0.x
Codex Harness Optimization
        ↓
SoL-Codex v1.x
Harness Mechanism SDK
        ↓
Harness Experiment Framework
        ↓
Trajectory + Evaluation
        ↓
Harness Registry
        ↓
Auto-Research
        ↓
Enterprise Harness Evolution Platform
```

SoL-Codex 应被设计成这条路线的第一个可执行节点，而不是终点。
