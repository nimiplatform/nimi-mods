# Agent-Capture Domain Spec

> Status: Active
> Date: 2026-03-25
> Scope: 角色文字输入为主、可附加参考图与已有 agent 背景 → 对话式角色捕捉 → brief 确认 → AgentDraft 生成与整理 → 显式 handoff 边界。

## 0. Normative Imports

- Domain boundary: `kernel/domain-contract.md` (`AC-DOM-*`)
- Capability boundary: `kernel/capability-contract.md` (`AC-CAP-*`)
- Pipeline: `kernel/pipeline-contract.md` (`AC-PIPE-*`)
- Error semantics: `kernel/error-model.md` (`AC-ERR-*`)
- Acceptance gates: `kernel/acceptance-contract.md` (`AC-ACC-*`)

## 1. 产品定位

Agent-Capture 是一个 desktop mod，也是一个帮助用户获得角色形象的工具。它以角色文字输入为一等入口，并允许用户附加参考图或选择已有 agent 作为背景上下文，通过轻对话逐步收敛成可继续使用的 `AgentDraft`。

它不直接创建 canonical agent，也不直接发布 Realm `OwnableAsset`。它负责生成和整理私有角色工作态对象，其中 `AgentDraft` 是用户可感知的主要产出物。

与 `Scene-Atlas` 一样，Agent-Capture 采用 mod 私有 working state 与显式后续交接分离的方法；`AgentDraft` 本身不是 Realm 正式对象，但其下游结果可进入后续正式流程。

核心边界：

- `Agent-Capture` 负责把角色描述输入变成可继续流转的角色草稿；参考图与已有 agent 仅作为可选补充上下文
- `Agent-Capture` 采用 feeling-led 对话式捕捉，而不是调查问卷式字段收集
- 对话应优先把角色落实到人物主体、体态轮廓、服装、材质、配饰、手持道具、色彩与画风上；背景默认只做辅助氛围，除非用户明确希望强调场景
- prompt shell 与 LLM 输出语言应跟随 desktop 当前系统语言；当系统语言不可判定或不在当前支持范围内时，默认使用中文
- 用户自行决定何时请求 `Generate Agent`；系统不承担“是否已经聊够”的判断职责
- 正式产出以显式 `Generate Agent` 结果为准；生成前系统必须先在会话内给出一句 brief 确认消息；对话期间可存在渐进式视觉反馈，但其不是 canonical output
- 默认正式图像产物应收敛为采用固定焦距倾向、全身完整入画、主体清晰稳定、适合后续角色制作继续使用的角色锚点图，而不是任意视角的角色美图
- `Agent-Capture` 不直接编辑 canonical agent，也不持有市场、授权、交易语义
- `Agent-Capture` 可定义显式 handoff 目标；当前仅定义 `Forge`
- 当前 workspace UI 里程碑收敛到“捕捉、生成、草稿整理”为止；handoff 边界继续保留为声明能力，而不是本轮 refactor 的用户可见操作
- 当已有 agent 背景与当前用户输入冲突时，当前用户输入永远优先
- 当前用户输入指当前会话中仍然有效的用户意图集合；系统以最新 brief 承载这组有效意图
- 系统必须把当前角色感觉沉淀为稳定 feeling anchor，再与 brief、working memory、visual spec 等状态一起组成正式生成上下文
- `sourcePrompt` 允许随着后续对话继续展开角色描述，不被冻结为最初一句输入
- 每次生成都基于当前状态化生成上下文；当前结果应带有轻量角色读取文本，帮助用户感知角色正在成形
- 当前结果若仍有偏差，默认由用户通过下一轮继续对话纠偏；系统职责是正确承接新的纠偏输入，而不是在生成后隐式追加自动纠偏回合

## 2. Domain Invariants

- `AC-DOM-001`: `AgentDraft` 是 Agent-Capture 内唯一的正式工作态对象。
- `AC-DOM-002`: `AgentDraft` 属于 mod 私有角色工作态，不得伪装成 canonical agent、Realm `OwnableAsset`、`Bundle` 或 market 商品对象。
- `AC-DOM-003`: Agent-Capture 采用 draft-first 工作流。首次有效输入时隐式创建 `AgentDraft`，而不是要求用户先填写完整项目表单。
- `AC-DOM-004`: 角色捕捉采用 feeling-led 对话式收敛，不采用调查问卷式显式分类采集。
- `AC-DOM-005`: 一次显式 `Generate Agent` 只产出一个当前 `generatedImage` 及一组配套文本草稿；`Regenerate` 直接替换当前结果，不保留复杂版本历史；默认正式图像结果采用固定焦距倾向、全身完整入画、主体清晰稳定的角色锚点图 framing。
- `AC-DOM-006`: `name`、`bio`、`tags` 为用户可编辑字段；`personaSeed` 是系统整理后的中间种子文本，不作为第一版直接手改字段。
- `AC-DOM-007`: 保存后的 `AgentDraft` 默认留在 mod 私有 working state 中；handoff 是显式后续动作，不是保存完成条件。
- `AC-DOM-008`: 空 draft 仅允许在当前上下文中临时存在；离开上下文后应自动清理。
- `AC-DOM-009`: 生成前必须存在系统自动总结的一句 brief；用户通过继续对话修正 brief，而不是直接编辑它。
- `AC-DOM-010`: 已选择的 existing agent 仅作为辅助上下文；当前用户输入始终优先，且上下文变化必须重新形成 brief。
- `AC-DOM-011`: 当前用户输入是当前会话中仍然有效的用户意图集合；新的冲突输入覆盖旧输入，生成使用最新 brief。
- `AC-DOM-012`: 每次生成都基于当前生成上下文；当前结果在存在时主要作为方向性上下文参与下一轮整理，而不是默认以图像字节递归回流。
- `AC-DOM-013`: 方向性跟随通过“保留什么、调整什么”的可感知变化成立，而不是靠空泛承诺。
- `AC-DOM-014`: 当前结果必须附带轻量角色读取文本，帮助用户感知角色正在成形。
- `AC-DOM-015`: 原始对话负责更新 feeling anchor 与其他状态；正式生成默认消费 feeling anchor 与当前 state bundle，而不是直接重放原始对话历史。

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
| `AC-DOM-005` | one-generate-one-result | 一次生成只产出一个当前结果，且默认正式图像结果是固定焦距倾向的全身角色锚点图 |
| `AC-DOM-006` | editable visible fields | 只开放 name / bio / tags 的直接编辑 |
| `AC-DOM-009` | brief confirmation | 生成前用一句 brief 对齐当前角色感觉和关键视觉特征 |
| `AC-DOM-010` | selected agent context precedence | 已选 agent 只做辅助背景；当前用户输入永远优先 |
| `AC-DOM-015` | feeling anchor + state bundle generation | 原始对话先沉淀 feeling，再由状态包驱动正式生成 |

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
