# Agent-Capture 流水线契约

> Rule ID 前缀: `AC-PIPE-*`
> 步骤事实源: [`tables/pipeline-states.yaml`](tables/pipeline-states.yaml)

---

## AC-PIPE-001 — Draft-first 对话式捕捉流水线

Agent-Capture 的默认流程是 draft-first、dialog-led，而不是 form-first、questionnaire-led。

**步骤**: 见 `pipeline-states.yaml` -> `pipeline: agent-capture-flow`

**规则**:
- 用户可从 `Image`、`Prompt` 或 `Image + Prompt` 开始。
- 首次有效输入时隐式创建 `AgentDraft`。
- 输入本身不自动触发 `Generate Agent`；生成必须由用户显式发起。
- 对话目标是角色感觉收敛，而不是固定字段填写。

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
