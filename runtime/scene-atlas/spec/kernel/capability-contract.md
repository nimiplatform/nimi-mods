# Scene-Atlas 能力契约

> Rule ID 前缀: `SA-CAP-*`
> 能力事实源: [`tables/capabilities.yaml`](tables/capabilities.yaml)

---

## SA-CAP-001 — 能力事实源

`tables/capabilities.yaml` 为 Scene-Atlas 能力声明的唯一事实源。

## SA-CAP-002 — SDK / Host 边界

Scene-Atlas 只能通过 `@nimiplatform/sdk/mod` 暴露的稳定 surface 访问宿主能力。

**规则**:
- 允许 `@nimiplatform/sdk/mod`
- 禁止 `@nimiplatform/sdk/runtime`
- 禁止直接访问 Tauri、Node builtins、宿主私有实现路径

## SA-CAP-003 — 图像生成能力

SceneCard 主体图生成必须通过 `runtime.media.image.generate` 完成。

**规则**:
- Scene-Atlas 不自行定义图像生成私有协议。
- `Regenerate` 和 style 切换都复用同一图像生成能力路径。

## SA-CAP-004 — 文本语义生成能力

`title / summary / placeCue / atmosphere / tags / sceneElements / storyHook?` 的初始生成必须通过 `runtime.ai.text.generate` 完成。

**规则**:
- 文本语义的初始产出与图像生成属于同一次 `Generate Scene` 结果。
- 文本后续允许用户编辑，但 Scene-Atlas 不以文本手工填写作为默认入口。

## SA-CAP-005 — 路由解析能力

Scene-Atlas 可通过 `runtime.route.list.options` 与 `runtime.route.resolve` 获取当前可用生成路由。

**规则**:
- route 不可用时必须显式失败，不得在 mod 内伪造成功。

## SA-CAP-006 — 本地持久化能力

Scene-Atlas 使用 host-provided 本地存储能力持久化 draft pack、scene card 和图片引用。

**规则**:
- 结构化状态通过 `storage.sqlite.*` 持久化
- 图片与导入文件引用通过 `storage.files.*` 管理

## SA-CAP-007 — UI 注册能力

Scene-Atlas 通过 Desktop mod UI 槽位接入宿主。

**规则**:
- 侧边栏入口通过 `ui.register.ui-extension.app.sidebar.mods`
- 工作区路由通过 `ui.register.ui-extension.app.content.routes`

## SA-CAP-008 — 发布交接边界

Scene-Atlas 只负责 material 侧发布交接，不负责上层 market 侧编辑与流通治理。

**规则**:
- Scene-Atlas 可发起 publish handoff
- Scene-Atlas 不定义 listing、定价、授权和市场可见性业务
