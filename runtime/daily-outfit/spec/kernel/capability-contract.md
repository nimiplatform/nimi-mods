# Daily Outfit 能力契约

> 所有者领域: `DO-CAP-*`

## DO-CAP-001 清单能力事实源

`tables/capabilities.yaml` 中的能力注册表为唯一事实源，必须与 `mod.manifest.yaml` 和运行时注册保持一致。

## DO-CAP-002 允许的 SDK 接口

Daily Outfit 业务路径只允许使用稳定的 `@nimiplatform/sdk/mod/*` 导出。

允许的子路径:
- `@nimiplatform/sdk/mod/hook` — 事件、数据、UI、turn hook
- `@nimiplatform/sdk/mod/runtime` — AI text/image 生成、媒体处理
- `@nimiplatform/sdk/mod/types` — 类型定义
- `@nimiplatform/sdk/mod/ui` — UI 工具
- `@nimiplatform/sdk/mod/logging` — 结构化日志
- `@nimiplatform/sdk/mod/i18n` — 国际化
- `@nimiplatform/sdk/mod/settings` — 设置/偏好

禁止的模式:
- `@nimiplatform/sdk/mod/host` — 绕过稳定 mod SDK 边界
- `@nimiplatform/sdk` 或 `@nimiplatform/sdk/runtime` — 仅限桌面层
- `@tauri-apps/*` — 仅限桌面层
- `node:*` 内置模块 — mod 运行时不可用

## DO-CAP-003 AI 视觉能力治理

衣物分类必须通过声明的视觉能力调用，使用结构化请求字段。

- 衣物照片分类使用 `runtime.ai.image.analyze` 能力。
- 自拍分析（肤色、体型推断）使用同一视觉能力。
- 禁止直接调用底层模型 HTTP 端点。

## DO-CAP-004 AI 图像生成能力治理

虚拟试穿图和拼图预览的生成规则。

- 虚拟试穿使用 `runtime.ai.image.generate` 能力。
- 拼图预览为客户端侧拼接，不依赖 AI 图像生成。
- 图像生成请求必须携带用户 selfie 和选中衣物的缩略图作为输入。

## DO-CAP-005 AI 文本能力治理

场景分析和推荐理由生成规则。

- 场景描述分析使用 `runtime.ai.text.generate` 能力。
- 推荐理由流式输出使用 `runtime.ai.text.stream` 能力。
- AI prompt 上下文必须包含 UserProfile 的 `styleWeights` 和 `sceneFrequencies` 作为软权重。
- AI prompt 中衣橱数据仅传递元数据（分类、标签），不传递原始照片。

## DO-CAP-006 数据 API 注册

Daily Outfit 通过 hook 数据 API 注册衣橱和方案的数据访问。

- `data.register.data-api.daily-outfit.wardrobe.*` — 衣物 CRUD
- `data.register.data-api.daily-outfit.outfits.*` — 方案查询与收藏
- `data.register.data-api.daily-outfit.profile.*` — 画像读写
- `data.register.data-api.daily-outfit.insights.*` — 洞察查询
- `data.register.data-api.daily-outfit.wearlog.*` — 穿搭日志读写

## DO-CAP-007 云端与本地双轨

AI 能力同时支持本地推理和云端 API，运行时路由决定实际后端。

- 本地模式: 使用 localai 兼容引擎运行视觉/文本/图像模型。
- 云端模式: 通过 runtime route 路由到云端 API。
- mod 代码不感知底层是本地还是云端，统一通过 SDK runtime facade 调用。
