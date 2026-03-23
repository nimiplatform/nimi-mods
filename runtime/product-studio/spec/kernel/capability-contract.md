# Product Studio 能力契约

> Rule ID 前缀: `PS-CAP-*`
> 能力注册表事实源: [`tables/capabilities.yaml`](tables/capabilities.yaml)

---

## PS-CAP-001 — 能力清单事实源

`tables/capabilities.yaml` 为唯一事实源，必须与 `mod.manifest.yaml` 和运行时注册保持一致。

**不变量**:
- `capabilities.yaml` 中的每个能力声明必须在 `mod.manifest.yaml` 中存在对应条目。
- 新增/删除能力时，必须同时更新 `capabilities.yaml` 和 `mod.manifest.yaml`。
- `manifest_identity.mod_id` 固定为 `world.nimi.product-studio`。

---

## PS-CAP-002 — 允许的 SDK 接口边界

**允许的 SDK 导入**:
- `@nimiplatform/sdk/mod` — hook / runtime / types / logging / i18n / settings 等业务 API
- `@nimiplatform/sdk/mod/shell` — shell facade
- `@nimiplatform/sdk/mod/lifecycle` — route lifecycle facade

**禁止的导入**:
- `@nimiplatform/sdk` 或 `@nimiplatform/sdk/runtime` — 仅限桌面层使用
- `@tauri-apps/*` — 仅限桌面层使用
- `node:*` 内置模块 — mod 运行时不可用

**SDK 边界事实源**: 见 `capabilities.yaml` → `sdk_boundary`

---

## PS-CAP-003 — AI 文本能力治理

Prompt 优化（PS-PIPE-002）必须通过声明的文本能力调用，禁止直接调用底层模型 HTTP 端点。

**允许的 AI 文本能力**:
- `runtime.ai.text.generate` — 单次调用（用于 prompt 优化）
- `runtime.ai.text.stream` — 流式调用（用于流式输出优化 prompt 给用户）

**视觉分析**:
- 场景图和参考图分析（为 prompt 优化提供图片视觉上下文）使用 `runtime.ai.text.generate`（with vision）
- AI 分析后提取的视觉特征作为 prompt 优化的输入上下文

**禁止**: 直接调用底层模型 HTTP 端点（如 Google AI Studio API、OpenAI API 等）。

---

## PS-CAP-004 — AI 图像生成能力治理

产品图生成规则，禁止直接调用底层模型 HTTP 端点。

**多模态替换模式** (`generationMode: multimodal`):
- 使用 `runtime.media.image.generate`
- 请求携带 `referenceImages`（来自 `PromptConfig.attachedImages` 中持久化后的本地图片引用）+ prompt

**文生图模式** (`generationMode: text-to-image`):
- 使用 `runtime.media.image.generate`
- 请求仅携带 prompt（不携带 referenceImages）

**批量作业管理**（PS-PIPE-004）:
- `runtime.media.jobs.submit` — 提交批量作业
- `runtime.media.jobs.get` — 查询作业状态
- `runtime.media.jobs.cancel` — 取消作业
- `runtime.media.jobs.subscribe` — 订阅实时进度
- `runtime.media.jobs.get.artifacts` — 获取生成结果

**禁止**: 直接调用底层模型 HTTP 端点。

---

## PS-CAP-005 — 数据 API 注册

Product Studio 注册以下显式数据域 API（见 `capabilities.yaml` → `data_register`）:

| 能力声明 | 对应实体 |
|---------|---------|
| `data.register.data-api.product-studio.projects.list/get/create/update` | Project（PS-DOM-001） |
| `data.register.data-api.product-studio.references.list/upsert` | ReferenceImage（PS-DOM-002） |
| `data.register.data-api.product-studio.scenes.list/upsert` | SceneImage（PS-DOM-004） |
| `data.register.data-api.product-studio.selling-points.list/upsert` | SellingPoint（PS-DOM-003） |
| `data.register.data-api.product-studio.prompts.list/get/upsert` | PromptConfig（PS-DOM-005） |
| `data.register.data-api.product-studio.batches.list/get/upsert` | BatchJob（PS-DOM-006） |
| `data.register.data-api.product-studio.gallery.list/get/upsert/rate` | GeneratedImage（PS-DOM-007） |

**存储后端**: `storage.sqlite.query` / `storage.sqlite.execute`（本地 SQLite）+ `storage.files.read` / `storage.files.write`（本地文件系统）。

---

## PS-CAP-006 — 云端与本地双轨

AI 能力统一通过 SDK runtime facade 调用，mod 不感知底层是本地模型还是云端 API。

**原则**:
- mod 代码中不出现任何具体模型厂商的 SDK（如 `@google-ai`, `openai` 等）。
- 路由选择（本地模型 / 云端 API）由 runtime 根据用户配置决定。
- `runtime.route.list.options`、`runtime.route.resolve`、`runtime.route.check.health` 用于查询可用路由和健康状态。
- 若无可用路由，在 gen-execute 阶段返回 `PS_ROUTE_NO_IMAGE_PROVIDER`（PS-ERR-001）。
