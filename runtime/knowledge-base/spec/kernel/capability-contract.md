# Knowledge Base Capability Contract

> Owner Domain: `KB-CAP-*`
> Authoritative source: `tables/capabilities.yaml`

---

## KB-CAP-001 — Mod 身份与注册

- Mod ID: `world.nimi.knowledge-base`
- Kind: `capability-mod`
- Entry: `./dist/mods/knowledge-base/index.js`
- 注册 nav-item（priority 160）+ route-page。
- Manifest capabilities 与源码常量（`contracts.ts`）必须一致。
- 22 个 capability 键全部在 manifest 与源码中声明（参考 `tables/capabilities.yaml`）。

## KB-CAP-002 — AI 能力消费

KB mod 消费三种 runtime 能力：

- `runtime.ai.text.generate`：query rewriting、对话标题生成。
- `runtime.ai.text.stream`：RAG 流式回答生成。
- `runtime.ai.embedding.generate`：chunk embedding + query embedding。

调用入口统一为 `@nimiplatform/sdk/mod`（`createModRuntimeClient`）。

路由策略：
- Chat route：`auto`（cloud-first）| `cloud` | `local`，由 `KBSettings.chatRouteSource` 控制。
- Embedding route：`auto`（cloud-first）| `cloud` | `local`，由 `KBSettings.embeddingRouteSource` 控制。
- Adapter 层（`llm-adapter.ts`、`embedding-adapter.ts`）桥接 `ModRuntimeClient` + selected binding → 服务层接口。

## KB-CAP-003 — 文档数据 API

通过 `data.register` 暴露文档管理能力：

- **documents.list**：返回所有 KBDocument（支持 status/tags/sort 过滤）。
- **documents.import**：UI 触发导入（file/text/url 三选一，互斥）。
- **documents.delete**：级联删除文档 + chunk + vector。

## KB-CAP-004 — 搜索数据 API

跨 mod 集成的主消费入口。

- 键：`data.query.data-api.knowledge-base.search`
- 输入：`{ query, topK?, documentIds?, threshold? }`
- 输出：`{ chunks: Array<KBChunk & { score, documentTitle }> }`
- 消费方传入 query 文本，KB mod 内部完成 embedding + cosine similarity + 结果返回。
- 跨 mod 消费者需自行提供 embedding（简化路径）。

## KB-CAP-005 — 对话数据 API

通过 `data.register` 暴露对话管理能力：

- **conversations.list**：返回对话列表（id/title/timestamps，不含 turns）。
- **conversations.get**：返回完整对话（含 turns）。
- **conversations.upsert**：创建或更新对话。
- **conversations.delete**：删除对话及其所有 turns。

## KB-CAP-006 — Runtime Route 查询

- 通过 `runtime.route.listOptions` 查询可用的 `text.generate` / `text.embed` 路由。
- 每 15 秒自动轮询更新（`use-kb-clients.ts`）。
- 路由选择遵循 mod 本地 source/connector/model 偏好，否则使用 runtime 默认 binding。

## KB-CAP-007 — 跨 Mod 集成

与 local-chat 的集成协议：

- local-chat 通过 `data.query.data-api.knowledge-base.search` 消费 KB 检索能力。
- 挂载时机：对话级——用户在 local-chat 会话中显式启用 KB 搜索。
- KB mod 不参与 local-chat turn hook，仅提供按需查询。
- KB 作为 data provider 注册搜索能力，消费方无需了解内部实现。

## KB-CAP-008 — 隐私与安全约束

- 文档原文与分块文本仅存储在 Knowledge Base 专属宿主 sqlite，不离开设备。
- Cloud-first（cloud）模式下 embedding 请求发送 chunk 文本到远端——设置页必须明示此行为。
- 不得未经用户确认自动上传文档原文。
- 对话历史仅本地存储。
- 不持久化第三方 API key。
- 导出仅允许用户显式触发。
