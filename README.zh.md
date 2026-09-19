# SoL-Codex

<p align="center"><a href="README.md">English</a> | 简体中文</p>

**面向长时间运行 Codex Agent 的 Harness 优化层。**

SoL-Codex 受 NVIDIA 的 SoL-Pi Harness 效率理念启发，是一个独立的 Codex 原生实现；它不会修改 Codex 或底层模型，也与 NVIDIA 或 OpenAI 没有关联。

它实现了四项机制：

- **Action Fusion**——在 `apply_patch` 之后，可选地自动运行一次可预测的验证命令，避免额外的一轮模型决策往返。
- **ObservationPack**——将大型工具结果以稳定的 `obs://...` 句柄归档到本地，并支持精确召回。
- **Evidence-Preserving Reducer**——仅当所有保留的引用都能通过归档源的精确校验时，才生成确定性的诊断收据。
- **Context Compact 状态保留**——在原生 Codex 压缩上下文之前保存任务关键状态，并在 `SessionStart(source="compact")` 时恢复。

> 正确性 > 效率。证据 > 摘要。降级 > 失败。

## 要求

- Node.js 22+
- 支持 Codex 的 Codex Desktop / ChatGPT Desktop，或支持当前插件/Hook 的 Codex CLI
- 推荐使用 Codex CLI，以便自动注册本地 MCP

## 本地快速安装

macOS / Linux：

```bash
git clone https://github.com/raydez/sol-codex.git
cd sol-codex
./install.sh
```

Windows PowerShell：

```powershell
git clone https://github.com/raydez/sol-codex.git
cd sol-codex
./install.ps1
```

安装器会：

1. 运行测试；
2. 将插件复制到 `~/.codex/plugins/sol-codex`；
3. 向 `~/.agents/plugins/marketplace.json` 添加个人 marketplace 条目；
4. 立即使用内置的零依赖 MCP 兼容服务器；
5. 如果已安装对应的可选依赖，则使用官方 MCP TypeScript SDK v2；
6. 如果系统中有 Codex CLI，则运行 `codex mcp add sol_codex ...`。

然后重启 ChatGPT Desktop / Codex，从个人 marketplace 源安装或启用 **SoL-Codex**，打开 `/hooks` 检查并信任其 Hooks，再确认 `/mcp` 中显示 `sol_codex`。

Codex 有意不会自动信任第三方 Hooks。安装器无法、也不应绕过这一步审核。

## GitHub marketplace 安装

本仓库发布后，用户可以将它添加为 marketplace 源：

```bash
codex plugin marketplace add OWNER/sol-codex
```

仓库包含 `.agents/plugins/marketplace.json`。本地证据 MCP 仍需要本地进程，因此请运行一次仓库安装器，或手动注册 MCP 服务器。

## 手动注册 MCP

```bash
## 可选：安装官方 MCP TypeScript SDK v2
npm run install:modern-mcp

# 注册本地 STDIO MCP 服务器
codex mcp add sol_codex --env SOL_CODEX_DATA_DIR="$HOME/.local/share/sol-codex" -- node "$PWD/src/mcp/server.mjs"
```

在 macOS 上，SoL-Codex 默认使用 `~/Library/Application Support/sol-codex` 作为数据目录；安装器会自动传入正确路径。

## 项目设置

在希望优化的项目中执行：

```bash
node /path/to/sol-codex/src/cli/main.mjs init
```

初始化时启用 Action Fusion：

```bash
node /path/to/sol-codex/src/cli/main.mjs init --action-fusion
```

Action Fusion 默认关闭，因为它会执行项目验证命令。Observation 归档、确定性收据生成和压缩状态 checkpoint 默认开启，且不会修改项目。

启用 Action Fusion 前请检查 `.sol-codex.json`。命令以 `shell:false` 执行；模型生成的任意 Shell 文本都不会直接传给 Action Fusion。

## SoL-Codex 当前如何在 Codex 中工作

Codex 的 `PostToolUse` Hook 可以添加上下文，但当前 Hook API 没有为任意本地工具提供安全、通用的“替换更新后的工具输出”能力。因此 SoL-Codex 使用两种模式：

1. **被动归档（默认）**：大型原生工具结果会被归档到本地，并向上下文加入一个简短的精确召回句柄。原生 Codex 行为保持不变。
2. **通过 MCP 打包执行**：对于已配置的冗长命令，Codex 可以调用 `run_packed`。命令的完整输出保留在本地，而模型收到精简结果和一个 `obs://...` 句柄。

这是有意为之：SoL-Codex 不会滥用 `PostToolUse decision:block` 或 `continue:false` 来伪造输出抑制。

## MCP 工具

- `obs_get(handle, max_chars?)`
- `obs_slice(handle, offset, limit)`
- `obs_search(handle, query, ...)`
- `evidence_get(handle)`
- `harness_status(cwd?)`
- `run_packed(cwd, name, ...)`

`run_packed` 只会执行项目 `packedCommands` 中命名的命令；或者在明确启用 Action Fusion 后，执行保守自动探测出的验证命令（`typecheck`、`lint`、`test` 或 `go test`）。

## 数据

所有归档都保留在本地。默认位置：

- macOS：`~/Library/Application Support/sol-codex`
- Linux：`$XDG_DATA_HOME/sol-codex` 或 `~/.local/share/sol-codex`
- Windows：`%LOCALAPPDATA%\\sol-codex`

每个会话：

```text
sessions/<session-id>/
├── state.json
├── metrics.jsonl
├── observations/
├── evidence/
└── compact/latest.json
```

## 配置

项目配置：`.sol-codex.json`

用户配置：`$XDG_CONFIG_HOME/sol-codex/config.json` 或 `~/.config/sol-codex/config.json`

参见 `config/sol-codex.example.json`。

## 安全模型

SoL-Codex 不是沙箱，也不是安全边界。

- v0.2.1 不包含远程 reducer。
- 归档保存在本地。
- Action Fusion 需要显式启用。
- 融合运行器会拒绝具有破坏性的命令 basename。
- 命令以 `shell:false` 和 argv 数组执行。
- 证据收据通过 SHA-256 与源绑定，且每个引用区间都会进行精确校验。
- Hook 出错时会降级为 Codex 原生行为。

参见 [SECURITY.md](SECURITY.md)。

## 验证安装

```bash
npm test
npm run doctor
```

在 Codex 中：

```text
/hooks
/mcp
```

## Benchmark 与成本验证

v0.2.1 是 **Validation Edition（验证版）**。只有在用户运行受控 Codex 实验并通过统计验证门禁后，本项目才会声称真实世界的 Token 节省。

### 达到验证标准的 Codex CLI A/B 实验

创建 manifest：

```bash
sol-codex benchmark init
```

编辑两个必需的冻结字段：

```json
{
  "environment": {
    "model": "YOUR_EXACT_CODEX_MODEL",
    "reasoningEffort": "medium"
  }
}
```

每个任务还必须使用精确的 40 位 Git commit SHA，并且应提供确定性的 `verify` 命令。

在消耗模型用量前检查 manifest：

```bash
sol-codex benchmark validate-manifest \
  --manifest sol-codex-benchmark.json
```

运行主要的 Native-vs-All 实验：

```bash
sol-codex benchmark run \
  --manifest sol-codex-benchmark.json \
  --variants native,all \
  --repeats 3 \
  --validation-grade
```

然后运行统计决策门禁：

```bash
sol-codex benchmark validate \
  --variant all \
  --min-tasks 30 \
  --min-paired-success-tasks 20
```

报告使用 Codex 上报的 `turn.completed.usage` Token 计数，并增加任务聚类 bootstrap 95% 置信区间、配对 Token 节省符号检验，以及针对二元质量结果的精确 McNemar 诊断。

只有满足以下全部条件，节省声明才会标记为 **SUPPORTED（有支持）**：

1. 最小任务/样本门禁通过；
2. 成功率差异的 95% 置信区间始终高于配置的非劣效界值；
3. 测试通过率差异的 95% 置信区间始终高于同一界值；
4. 配对 Token 节省的 95% 置信区间高于零。

否则结果为 `INCONCLUSIVE` 或 `QUALITY-REGRESSION`。仅凭原始 Token 数更低并不足以得出结论。

### 内置真实 GitHub 任务子集

仓库包含 **SWE-bench Verified** 的固定 30 个实例子集。SWE-bench Verified 是一个经过人工验证的真实 GitHub issue/PR 任务基准。

列出任务：

```bash
sol-codex benchmark suite \
  --action list \
  --name swebench-verified-30
```

从 Hugging Face SWE-bench 数据集服务器获取官方任务行：

```bash
sol-codex benchmark suite \
  --action fetch \
  --name swebench-verified-30 \
  --output swebench-verified-30.jsonl
```

该命令有意只获取官方任务元数据。要进行端到端验证，请根据这些行准备冻结的 SoL-Codex manifest：

```bash
sol-codex benchmark suite \
  --action prepare \
  --rows swebench-verified-30.jsonl \
  --repos-dir .swebench-repos \
  --manifest-output swebench-sol-codex.json \
  --model YOUR_EXACT_CODEX_MODEL \
  --reasoning-effort medium
```

然后运行 Native 和 All，并保留外部质量验证：

```bash
sol-codex benchmark run \
  --manifest swebench-sol-codex.json \
  --variants native,all \
  --repeats 3 \
  --validation-grade
```

对每次重复运行，导出 Codex 生成的精确 Git patch：

```bash
sol-codex benchmark export-swebench \
  --variant native --repeat 1 \
  --output native-r1.json

sol-codex benchmark export-swebench \
  --variant all --repeat 1 \
  --output all-r1.json
```

使用官方 SWE-bench evaluator 评测每个预测文件，例如：

```bash
swebench eval verified -p native-r1.json --run-id sol-codex-native-r1 -j 8
swebench eval verified -p all-r1.json    --run-id sol-codex-all-r1    -j 8
```

将官方 `results.json` 导入对应的 SoL-Codex 运行单元：

```bash
sol-codex benchmark import-swebench \
  --results logs/evaluation/sol-codex-native-r1/results.json \
  --variant native --repeat 1

sol-codex benchmark import-swebench \
  --results logs/evaluation/sol-codex-all-r1/results.json \
  --variant all --repeat 1
```

重复导出/评测/导入第 2、3 次运行，然后执行：

```bash
sol-codex benchmark validate --variant all
```

SoL-Codex 不会在 Codex 任务提示中使用 SWE-bench 的 gold patch。环境构建和评测仍由官方 SWE-bench evaluator 负责。发布结果前，还应使用 `swebench eval verified --gold` 对选定实例做合理性检查，因为 evaluator 或镜像故障不能被误标为 Agent 失败。

### 完整机制消融

完成主要 Native-vs-All 实验后，进一步研究各机制的贡献：

```bash
sol-codex benchmark run \
  --manifest sol-codex-benchmark.json \
  --variants native,plugin-off,observation,action,reducer,compact,all \
  --repeats 3 \
  --validation-grade
```

不要将各机制的百分比相加；它们的效果会重叠。

### Desktop / ChatGPT Desktop

Desktop 实验仍使用本地 OTLP/HTTP JSON collector：

```bash
sol-codex benchmark collect
sol-codex benchmark otel-config
```

为每个新任务会话标记：

```bash
sol-codex benchmark begin --task bug-001 --variant native
# 执行一次全新的 Desktop Codex 任务
sol-codex benchmark end --success true --test-pass true
sol-codex benchmark ingest --otel .sol-codex-benchmark/otel.jsonl
```

对 `all` 重复上述过程，然后执行：

```bash
sol-codex benchmark report
sol-codex benchmark validate --variant all
```

### 真实世界结果政策

`REAL_WORLD_RESULTS.md` 有意保持为空。只有在保留精确 Codex 版本、模型、推理强度、任务集、仓库修订版本、重复次数、质量标准和验证报告后，才能添加结果。合成单元测试只能验证 Benchmark 机制；不能证明 SoL-Codex 能在真实 Codex 运行中节省 Token。

参见 [docs/benchmark.md](docs/benchmark.md) 和 [docs/validation-protocol.md](docs/validation-protocol.md)。

## 当前 Codex API 限制

本版本有意不声称被动 ObservationPack 能让 Codex Token 使用量减半。当前原生 `PostToolUse` 不能通过 `updatedMCPToolOutput` / `suppressOutput` 安全替换任意原生工具结果；这些字段虽然会被解析，但尚未得到完整支持。因此，真正的主动打包通过本地 MCP 的 `run_packed` 路径提供，而原生工具输出则被动归档。

## 状态

实验性 v0.2.1 Validation Edition（验证版）。本仓库是迈向与模型无关的 Harness Evolution 路线中的第一个运行时适配器。

## 致谢

本项目受 NVIDIA 的 SoL-Pi 论文和公开实现启发。SoL-Codex 是面向 Codex 的独立、干净实现，与 NVIDIA 或 OpenAI 没有关联。

## 许可证

MIT
