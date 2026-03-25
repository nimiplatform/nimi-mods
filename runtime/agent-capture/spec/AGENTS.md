# Agent-Capture Spec AGENTS

> 在 `nimi-mods/runtime/agent-capture/spec/` 下工作的 AI agent 约定。

## 权威结构

- `kernel/*.md`：Agent-Capture 跨领域契约，Rule ID 前缀 `AC-*`。
- `kernel/tables/*.yaml`：权威事实源。字段、步骤、能力、错误码和验收用例必须先写入 YAML，再由 `.md` 引用。
- `agent-capture.md`：领域文档（产品定位、核心边界、功能域、非目标、集成关系）。

## Rule ID 命名规则

| 前缀 | 所属文件 |
|------|---------|
| `AC-DOM-*` | `kernel/domain-contract.md` |
| `AC-CAP-*` | `kernel/capability-contract.md` |
| `AC-PIPE-*` | `kernel/pipeline-contract.md` |
| `AC-ERR-*` | `kernel/error-model.md` |
| `AC-ACC-*` | `kernel/acceptance-contract.md` |

## 编辑规则

- 先修改 `kernel/tables/*.yaml`，再对齐 kernel/domain 文档，保持同一次变更。
- 不允许在 `.md` 中重复定义已在 YAML 中定义的字段或枚举值，引用即可。
- 不允许把 `AgentDraft` 提前伪装成 canonical agent、Realm `OwnableAsset` 或 market 商品对象；`Agent-Capture` 只定义 mod 私有角色工作态与显式 handoff 边界。
- 不允许把对话式角色捕捉退化成调查问卷式字段收集；若需要固定字段，必须证明其为稳定 domain truth，而不是 UI 采集便利。
- 不允许把图像“渐进显化”写成产品成立的唯一前提；正式产出仍以显式 `Generate Agent` 的结果为准。

## 建议验证

当修改本目录 spec 文件时：

1. 确认 `AC-*` Rule ID 在 `agent-capture.md` 中有引用或映射说明。
2. 确认 `kernel/tables/*.yaml` 中的 `source_rule` 指向有效 Rule ID。
3. 确认 `kernel/tables/capabilities.yaml` 与 desktop host / sdk-mod 边界一致，不越过 `@nimiplatform/sdk/mod` 与 Realm canonical truth 边界。
