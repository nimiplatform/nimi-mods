# Agent-Capture 验收契约

> Rule ID 前缀: `AC-ACC-*`
> 验收用例事实源: [`tables/acceptance-cases.yaml`](tables/acceptance-cases.yaml)

---

## AC-ACC-001 — Draft-first 创建验收门

**覆盖用例**: AC-001 ~ AC-003

**验收条件**:
- 首次有效输入时隐式创建 `AgentDraft`
- 输入本身不自动触发 `Generate Agent`
- 一次 `Generate Agent` 只产出一个当前 `generatedImage`

## AC-ACC-002 — 对话式捕捉验收门

**覆盖用例**: AC-004、AC-005

**验收条件**:
- 角色收敛通过 feeling-led 对话进行，而不是调查问卷式固定字段收集
- `styleHint` 为可选自由文本，不强制要求硬枚举风格选择

## AC-ACC-003 — Draft 整理与替换验收门

**覆盖用例**: AC-006、AC-007、AC-008

**验收条件**:
- `Regenerate` 直接替换当前结果
- `name`、`bio`、`tags` 可编辑且不自动触发重生成
- `personaSeed` 不作为第一版直接手改字段

## AC-ACC-004 — Handoff 与清理验收门

**覆盖用例**: AC-009、AC-010、AC-011

**验收条件**:
- 保存 draft 不自动触发 handoff
- handoff 失败不得破坏本地 draft
- 空 draft 仅在当前上下文中临时保留，离开后自动删除
