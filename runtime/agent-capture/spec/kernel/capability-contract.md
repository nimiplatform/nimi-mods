# Agent-Capture 能力契约

> Rule ID 前缀: `AC-CAP-*`
> 能力事实源: [`tables/capabilities.yaml`](tables/capabilities.yaml)

---

## AC-CAP-001 — 能力事实源

`tables/capabilities.yaml` 为 Agent-Capture 能力声明的唯一事实源。

## AC-CAP-002 — SDK / Host 边界

Agent-Capture 只能通过 `@nimiplatform/sdk/mod` 暴露的稳定 surface 访问宿主能力。

**规则**:
- 允许 `@nimiplatform/sdk/mod`
- 禁止 `@nimiplatform/sdk/runtime`
- 禁止直接访问 Tauri、Node builtins、宿主私有实现路径

## AC-CAP-003 — 图像生成能力

`generatedImage` 的正式产出必须通过 `runtime.media.image.generate` 完成。

**规则**:
- Agent-Capture 不自行定义图像生成私有协议。
- `Regenerate` 复用同一图像生成能力路径。
- 对话中的渐进式视觉反馈若存在，也不得绕过同一稳定生成边界。

## AC-CAP-004 — 文本生成能力

`name`、`bio`、`personaSeed`、`tags` 的初始生成必须通过 `runtime.ai.text.generate` 完成。

**规则**:
- 文本初始生成与图像生成共同构成一次 `Generate Agent` 结果。
- 文本后续允许轻量人工编辑，但 Agent-Capture 不以表单手填作为默认入口。

## AC-CAP-005 — 路由解析能力

Agent-Capture 可通过 `runtime.route.list.options` 与 `runtime.route.resolve` 获取当前可用生成路由。

**规则**:
- route 不可用时必须显式失败，不得在 mod 内伪造成功。
- route override 若超出当前可用快照，必须 fail close。

## AC-CAP-006 — 本地持久化能力

Agent-Capture 使用 host-provided 本地存储能力持久化 draft 状态与图片引用。

**规则**:
- 结构化状态通过 `storage.sqlite.*` 持久化
- 图片与导入文件引用通过 `storage.files.*` 管理

## AC-CAP-007 — UI 注册能力

Agent-Capture 通过 Desktop mod UI 槽位接入宿主。

**规则**:
- 侧边栏入口通过 `ui.register.ui-extension.app.sidebar.mods`
- 工作区路由通过 `ui.register.ui-extension.app.content.routes`

## AC-CAP-008 — Forge handoff 边界

Agent-Capture 当前只定义 `Forge` 作为潜在 handoff 目标。

**规则**:
- Agent-Capture 可通过显式 handoff surface 请求将当前 `AgentDraft` 交给 `Forge`
- handoff 只传递 draft 工作态所需信息，不改变 canonical agent / realm truth
- handoff 失败必须显式返回，不得伪装成已成功交接
