# Scene-Atlas 验收契约

> Rule ID 前缀: `SA-ACC-*`
> 验收用例事实源: [`tables/acceptance-cases.yaml`](tables/acceptance-cases.yaml)

---

## SA-ACC-001 — Pack-first 创建验收门

**覆盖用例**: SA-001 ~ SA-003

**验收条件**:
- 导入第一张图片时隐式创建 `ScenePack draft`
- 导图本身不自动触发 `Generate Scene`
- 一次 `Generate Scene` 只产出一个 `SceneCard`

## SA-ACC-002 — style lock 验收门

**覆盖用例**: SA-004、SA-005

**验收条件**:
- `defaultStyle` 在首次成功生成后确定
- pack 内存在 `SceneCard` 时，`defaultStyle` 不允许直接修改

## SA-ACC-003 — SceneCard 编辑与替换验收门

**覆盖用例**: SA-006、SA-007

**验收条件**:
- 文本字段可编辑且不触发重新生成
- `Regenerate` 直接替换当前结果，不保留历史版本

## SA-ACC-004 — readiness 与发布验收门

**覆盖用例**: SA-008、SA-009、SA-010

**验收条件**:
- `isReady` 与 `readinessIssues[]` 根据硬条件自动派生
- 非 ready pack 不得发布
- `ScenePack` 发布后继续编辑的是 pack，不是 asset

## SA-ACC-005 — pack 顺序与清理验收门

**覆盖用例**: SA-011、SA-012

**验收条件**:
- pack 内 `SceneCard` 顺序必须保留并可用于下游叙事消费
- 空 draft pack 仅在当前上下文中临时保留，离开后自动删除
