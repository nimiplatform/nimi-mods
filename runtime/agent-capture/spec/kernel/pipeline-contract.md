# Agent-Capture 流水线契约

> Rule ID 前缀: `AC-PIPE-*`
> 步骤事实源: [`tables/pipeline-states.yaml`](tables/pipeline-states.yaml)

---

## AC-PIPE-001 — Draft-first 对话式捕捉流水线

Agent-Capture 的默认流程是 draft-first、dialog-led，而不是 form-first、questionnaire-led。

**步骤**: 见 `pipeline-states.yaml` -> `pipeline: agent-capture-flow`

**规则**:
- 用户可从角色描述文字开始，并可附加 `Image` 与 selected existing agent 作为补充上下文。
- 首次有效输入时隐式创建 `AgentDraft`。
- 输入本身不自动触发 `Generate Agent`；生成必须由用户显式发起。
- 对话目标是角色感觉收敛，而不是固定字段填写。
- 当前会话中的有效用户意图可由多轮对话逐步形成，而不是只取最后一句消息。

## AC-PIPE-002 — styleHint 辅助输入流水线

Agent-Capture 的风格控制是自由提示，不是硬枚举风格选择器。

**规则**:
- 系统可在输入后提供一个推荐风格方向。
- 用户可补充、替换或留空 `styleHint`。
- `styleHint` 服务于生成，不构成稳定 domain truth 分类。

## AC-PIPE-003 — 结果替换策略

Agent-Capture 不保留复杂图像候选历史。

**规则**:
- 一次 `Generate Agent` 只生成一个当前 `generatedImage`。
- `Regenerate` 直接替换当前结果以及配套文本草稿。
- `name`、`bio`、`tags` 的后续编辑不自动触发重生成。

## AC-PIPE-004 — draft curate 与显式 handoff

Agent-Capture 的生成后流程以当前 draft 整理为主，handoff 为后续显式动作。

**规则**:
- 用户可编辑 `name`、`bio`、`tags`。
- 用户可选择停留在当前 draft。
- handoff 到 `Forge` 是可选显式动作，不是保存的默认后果。

## AC-PIPE-005 — 空 draft 清理

空 draft 允许在当前操作上下文中临时存在，但不应长期残留。

**步骤**: 见 `pipeline-states.yaml` -> `empty_draft_cleanup`

**规则**:
- 若用户仍处于当前 draft 编辑上下文中，空 draft 可暂时保留。
- 当用户离开该上下文时，空 draft 应自动删除。

## AC-PIPE-006 — brief confirm before generate

Agent-Capture 不负责判断“是否已经聊够”，而由用户自行决定何时请求生成。

**步骤**: 见 `pipeline-states.yaml` -> `pipeline: agent-capture-flow`

**规则**:
- 用户请求 `Generate Agent` 时，系统必须先在主会话流中输出一句当前 brief 确认消息，再进入正式生成。
- 用户若不认可当前 brief，应继续对话修正，而不是直接编辑 brief 文本。
- 用户确认 brief 后，显式 `Generate Agent` 才可继续执行。
- 最新 brief 必须反映当前会话中仍然有效的用户意图集合，而不是机械使用完整原始历史或仅使用最后一句消息。
- 当当前结果已存在时，最新 brief 还应说明本轮变化将延续什么、调整什么。

## AC-PIPE-007 — current generation context assembly

Agent-Capture 的每次生成都必须先装配当前生成上下文。

**规则**:
- 当前生成上下文以当前有效用户意图集合为基础，并按需并入 `sourceImage`、selected existing agent 背景、`styleHint`、当前 `generatedImage` 与最新修正。
- 当用户只是补充或微调当前角色方向时，系统应把这次输入视为对当前上下文的增量更新。
- 当用户明确表达重来、改换方向或放弃当前结果时，系统才应重置相应的上下文部分。

## AC-PIPE-008 — result readout

Agent-Capture 的生成结果不仅包含图像，还必须包含轻量角色读取文本。

**规则**:
- 每次当前结果形成后，系统都应同步生成 `characterReadout`。
- `characterReadout` 应帮助用户理解“这个角色现在像谁、是什么感觉、这轮改了什么”。
- `characterReadout` 不是 `bio` 的别名，也不承担设定真相职责。
