# Agent-Capture Domain Spec

> Status: Active
> Date: 2026-03-25
> Scope: 图像/提示输入 → 对话式角色捕捉 → AgentDraft 生成与整理 → 显式 handoff 边界。

## 0. Normative Imports

- Domain boundary: `kernel/domain-contract.md` (`AC-DOM-*`)
- Capability boundary: `kernel/capability-contract.md` (`AC-CAP-*`)
- Pipeline: `kernel/pipeline-contract.md` (`AC-PIPE-*`)
- Error semantics: `kernel/error-model.md` (`AC-ERR-*`)
- Acceptance gates: `kernel/acceptance-contract.md` (`AC-ACC-*`)

## 1. 产品定位

Agent-Capture 是一个 desktop mod，用于把用户的图像输入或角色感觉，通过轻对话逐步收敛成可继续使用的 `AgentDraft`。

它不直接创建 canonical agent，也不直接发布 Realm `OwnableAsset`。它负责生成和整理私有角色工作态对象，其中 `AgentDraft` 是用户可感知的主要产出物。

与 `Scene-Atlas` 一样，Agent-Capture 采用 mod 私有 working state 与显式后续交接分离的方法；`AgentDraft` 本身不是 Realm 正式对象，但其下游结果可进入后续正式流程。

核心边界：

- `Agent-Capture` 负责把 `Image` / `Prompt` / `Image + Prompt` 变成可继续流转的角色草稿
- `Agent-Capture` 采用 feeling-led 对话式捕捉，而不是调查问卷式字段收集
- 正式产出以显式 `Generate Agent` 结果为准；对话期间可存在渐进式视觉反馈，但其不是 canonical output
- `Agent-Capture` 不直接编辑 canonical agent，也不持有市场、授权、交易语义
- `Agent-Capture` 可定义显式 handoff 目标；当前仅定义 `Forge`

## 2. Domain Invariants

- `AC-DOM-001`: `AgentDraft` 是 Agent-Capture 内唯一的正式工作态对象。
- `AC-DOM-002`: `AgentDraft` 属于 mod 私有角色工作态，不得伪装成 canonical agent、Realm `OwnableAsset`、`Bundle` 或 market 商品对象。
- `AC-DOM-003`: Agent-Capture 采用 draft-first 工作流。首次有效输入时隐式创建 `AgentDraft`，而不是要求用户先填写完整项目表单。
- `AC-DOM-004`: 角色捕捉采用 feeling-led 对话式收敛，不采用调查问卷式显式分类采集。
- `AC-DOM-005`: 一次显式 `Generate Agent` 只产出一个当前 `generatedImage` 及一组配套文本草稿；`Regenerate` 直接替换当前结果，不保留复杂版本历史。
- `AC-DOM-006`: `name`、`bio`、`tags` 为用户可编辑字段；`personaSeed` 是系统整理后的中间种子文本，不作为第一版直接手改字段。
- `AC-DOM-007`: 保存后的 `AgentDraft` 默认留在 mod 私有 working state 中；handoff 是显式后续动作，不是保存完成条件。
- `AC-DOM-008`: 空 draft 仅允许在当前上下文中临时存在；离开上下文后应自动清理。

## 3. Domain Increments

### 3.1 Draft Object

完整实体定义见 [`kernel/domain-contract.md`](kernel/domain-contract.md)，字段事实源见 [`kernel/tables/entities.yaml`](kernel/tables/entities.yaml)。

| Rule ID | 实体 | 说明 |
|---------|------|------|
| `AC-DOM-001` | `AgentDraft` | 对话式角色捕捉的私有工作态对象 |
| `AC-DOM-002` | capture working state / Forge handoff boundary | `AgentDraft` 是 mod 私有工作态，不是 canonical agent |

### 3.2 Capture Flow

| Rule ID | 规则 | 说明 |
|---------|------|------|
| `AC-DOM-003` | implicit draft | 首次有效输入时隐式创建 draft |
| `AC-DOM-004` | feeling-led capture | 通过对话逐步提炼角色感觉 |
| `AC-DOM-005` | one-generate-one-result | 一次生成只产出一个当前结果 |
| `AC-DOM-006` | editable visible fields | 只开放 name / bio / tags 的直接编辑 |

### 3.3 Handoff Boundary

| Rule ID | 规则 | 说明 |
|---------|------|------|
| `AC-DOM-007` | explicit draft handoff | handoff 是显式动作，不是保存默认行为 |
| `AC-DOM-008` | empty draft cleanup | 空 draft 离开上下文后自动清理 |

## 4. Cross-Repo Boundaries

- Desktop host 边界遵循 `nimi/spec/desktop/kernel/hook-capability-contract.md` 与 `nimi/spec/desktop/kernel/mod-governance-contract.md`。
- Mod SDK 边界遵循 `nimi/spec/sdk/mod.md` 与 `nimi/spec/sdk/kernel/mod-contract.md`。
- Realm `attachment` / `asset` 语义遵循：
  - `nimi/spec/realm/kernel/attachment-contract.md`
  - `nimi/spec/realm/kernel/asset-contract.md`
  - `nimi-realm/spec/realm/kernel/attachment-contract.md`
  - `nimi-realm/spec/realm/kernel/asset-contract.md`

## 5. Non-goals

- 不做调查问卷式 agent 配置器。
- 不做重型 agent 编辑器。
- 不直接创建 canonical agent。
- 不做多候选抽卡式图像选择器。
- 不在 mod 内定义市场 listing、定价、授权和流通规则。
