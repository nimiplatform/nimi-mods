# Agent-Capture 领域契约

> Rule ID 前缀: `AC-DOM-*`
> 字段事实源: [`tables/entities.yaml`](tables/entities.yaml)

---

## AC-DOM-001 — AgentDraft（角色草稿）

`AgentDraft` 是对话式角色捕捉的私有工作态对象，也是 Agent-Capture 的主要产出物。

**字段**: 见 `entities.yaml` -> `entity: AgentDraft`

**不变量**:
- `AgentDraft` 必须至少拥有一个有效角色输入，才能进入显式生成阶段；`sourcePrompt` 单独存在即可满足该条件，`sourceImage` 作为可选补充输入存在。
- `generatedImage` 是当前正式图像结果；不存在多候选 canonical image 集。
- `name`、`bio`、`tags` 可在生成后编辑。
- `personaSeed` 是系统整理后的中间种子文本，不作为第一版直接手改字段。
- `AgentDraft` 不定义 readiness 字段，也不承担发布语义。

## AC-DOM-002 — capture working state / Forge handoff 边界

Agent-Capture 中的 `AgentDraft` 属于 mod 私有角色工作态，不属于 canonical agent、Realm `OwnableAsset` 或 market 对象。

**规则**:
- Agent-Capture 不直接创建 canonical agent。
- `AgentDraft` 保存后默认继续停留在 mod 私有 working state 中。
- `AgentDraft` 可在后续显式 handoff 到 `Forge`。
- handoff 不改变 `AgentDraft` 的工作态身份，也不要求立即销毁本地 draft。

## AC-DOM-003 — implicit draft

Agent-Capture 采用 draft-first 工作流。

**规则**:
- 用户首次提供有效角色输入时，系统隐式创建当前 `AgentDraft`。
- 用户无需在输入前先创建项目壳或填写完整设定。

## AC-DOM-004 — feeling-led capture

Agent-Capture 通过轻对话提炼角色感觉，而不是通过固定字段问卷收集角色设定。

**规则**:
- 系统提问应服务于角色气质收敛，不应退化为问卷式参数采集。
- `styleHint` 作为自由文本辅助输入存在，不引入硬枚举风格字段。
- 对话阶段可提供渐进式视觉反馈，但不应把其中间态反馈当作正式最终结果。

## AC-DOM-009 — brief confirmation

Agent-Capture 在显式生成前必须形成当前 brief。

**规则**:
- brief 是系统基于当前输入形成的一句自然语言总结，用于确认当前角色感觉与关键视觉特征。
- brief 不作为用户直接编辑字段暴露；用户应通过继续对话修正系统理解，再由系统重新形成 brief。
- brief 确认发生在主会话流中，不采用独立问卷或审批式弹窗流程。

## AC-DOM-010 — selected agent context precedence

已选择的 existing agent 只作为辅助背景上下文。

**规则**:
- existing agent 必须通过显式选择进入当前 draft 上下文，不以手工粘贴完整设定文本作为正式入口。
- existing agent 不构成必须逐条兑现的完整生成约束。
- 当前会话中的用户输入永远优先于 existing agent 背景；若两者冲突，系统必须以当前用户输入形成和更新 brief。
- 添加、替换或移除 existing agent 都属于输入变化，系统必须据此重新形成当前 brief。

## AC-DOM-011 — effective user intent set

Agent-Capture 生成前使用的“当前用户输入”不是最后一句消息，也不是完整原始历史的机械拼接。

**规则**:
- 当前用户输入指当前会话中仍然有效的用户意图集合。
- 补充性的用户输入默认累加到当前意图集合中。
- 与当前意图冲突的新输入默认覆盖旧输入。
- 系统必须基于当前有效意图集合重新形成最新 brief，并以最新 brief 进入显式生成。

## AC-DOM-005 — one-generate-one-result

一次显式 `Generate Agent` 只产出一个当前 `generatedImage` 结果。

**规则**:
- 输入本身不得自动触发生成。
- `Regenerate` 直接替换当前 `generatedImage` 与配套草稿，不保留复杂版本历史。
- 当前结果替换策略优先于多候选保留策略。

## AC-DOM-006 — editable visible fields

Agent-Capture 对用户暴露的草稿编辑面必须保持轻量。

**规则**:
- 用户可直接编辑 `name`、`bio`、`tags`。
- `personaSeed` 不作为第一版直接手改字段。
- Agent-Capture 不承担重型角色配置器职责。

## AC-DOM-007 — explicit handoff

`Forge` handoff 是显式动作，不是默认保存完成条件。

**规则**:
- 保存 `AgentDraft` 不会自动触发 handoff。
- handoff 失败不得破坏本地 `AgentDraft`。
- 缺少 handoff 能力时必须 fail close，并将 draft 保留在本地 working state 中。

## AC-DOM-008 — empty draft cleanup

空的 `AgentDraft` 允许在当前操作上下文中临时存在，但不应长期残留。

**规则**:
- 若用户仍处于当前 draft 编辑上下文中，空 draft 可暂时保留。
- 当用户离开该上下文时，空的 draft 应自动删除。
