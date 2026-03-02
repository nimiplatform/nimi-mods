---
title: Nimi Knowledge-Base Mod SSOT
status: ACTIVE
version: v1.0
updated_at: 2026-03-02
rules:
  - KB 业务执行真相唯一归属本文件；`@nimiplatform/nimi/ssot/mod/governance.md` 仅定义 Mod 通用治理规则。
  - KB 执行主路径固定在 `nimi-mods/knowledge-base`，不得以独立网页壳替代 Nimi runtime mod 形态。
  - 文档数据默认仅本地处理（IndexedDB），不隐式上传；导出/分享必须由用户显式触发。
  - AI 调用入口统一为 `@nimiplatform/sdk/mod/ai`（`generateText|streamText|generateEmbedding`），不保留 legacy 场景调用兼容路径。
  - 搜索能力通过 `data.register` 暴露为 data-api capability，不使用 `inter-mod.provide`。
  - Embedding 路由默认 cloud-first（token-api），预留 local-runtime 接口；路由来源由 `routeHint` 控制，不硬编码 provider。
  - 向量检索使用 cosine similarity 浏览器端实现，不依赖 runtime RuntimeKnowledgeService（K-KNOW Phase 1 仅 in-memory + substring matching）。
  - 多轮对话通过 query rewriting 实现上下文连贯；rewritten query 记录在 turn 中供审计。
  - Hook 客户端创建入口统一为 `createHookClient(modId)`，不得恢复历史命名与中间别名。
  - KB 作为 external/default mod 时，必须保持 `manifest + entry + dist` 统一加载链路，不恢复 builtin 专用路径。
  - KB 对外稳定调用面固定为 `@nimiplatform/sdk/mod/ai|hook|types|ui|logging|utils|runtime-route`；禁止 root import 与 internal/host 直连。
  - KB 的 root manifest 与源码 manifest 必须语义一致（版本、能力集合、ai 依赖声明）。
  - KB 代码组织固定为 `components/state/services/hooks` 分层；页面文件只保留容器装配，业务编排下沉到 controller hooks。
  - KB 禁止非 `index.ts/tsx` 的 re-export 壳文件；调用方必须直连真实实现模块，减少调试跳转层。
  - KB 的用户可见文案必须纳入 mod i18n；当前 zh/en 双语覆盖为强制要求。
---

# Nimi Knowledge-Base 唯一真相（SSOT）

## 1. 目标与边界

1. 提供私有本地知识库助手（Desktop PRIVATE），实现文档摄入、语义检索、多轮问答全链路。
2. 文档不离开设备——所有解析、分块、向量化、检索均在浏览器端完成。
3. 通过 data-api capability 向其他 mod（如 local-chat）暴露知识检索能力。

不属于 Knowledge-Base 域：

1. 云端知识库同步与多设备共享（归平台同步层，当前不实现）。
2. 协作知识库与多人编辑（归协作层，当前不实现）。
3. Runtime RuntimeKnowledgeService 消费（K-KNOW Phase 1 仅 in-memory，KB mod 独立实现向量存储）。
4. 模型与服务生命周期写操作（归 `@nimiplatform/nimi/ssot/runtime/local-runtime.md`，由 Core 控制面独占）。
5. 平台经济、身份、云受保护能力写入（归 `@nimiplatform/nimi/ssot/mod/governance.md` 与 L0 协议）。

## 2. 核心对象

### 2.1 KBDocument

1. `id`: string (ULID) — 文档唯一标识。
2. `title`: string — 文档标题（用户可编辑或从文件名推导）。
3. `sourceUri`: string — 来源 URI（文件路径/粘贴标识/URL）。
4. `sourceKind`: `'file' | 'paste' | 'url'` — 来源类型。
5. `mimeType`: string — MIME 类型（`text/plain`, `text/markdown`, `application/pdf` 等）。
6. `fileSize`: number — 原始文件大小（字节）。
7. `status`: `'pending' | 'parsing' | 'chunking' | 'embedding' | 'ready' | 'error'` — 文档处理状态。
8. `chunkCount`: number — 分块数量（`ready` 状态后固定）。
9. `tags`: string[] — 用户标签。
10. `errorReason?`: string — 失败 reasonCode（仅 `error` 状态）。
11. `createdAt`: string — 创建时间 (ISO 8601)。
12. `updatedAt`: string — 最后更新时间 (ISO 8601)。

### 2.2 KBChunk

1. `id`: string (ULID) — 分块唯一标识。
2. `documentId`: string — 所属文档 ID。
3. `text`: string — 分块文本内容。
4. `chunkIndex`: number — 在文档中的序号（从 0 开始）。
5. `tokenCount`: number — 估算 token 数。
6. `metadata`: `{ heading?: string; pageNumber?: number; rowRange?: [number, number] }` — 结构化位置元数据。

### 2.3 KBVector

1. `id`: string (ULID) — 向量记录唯一标识。
2. `chunkId`: string — 关联的 chunk ID。
3. `documentId`: string — 关联的文档 ID（冗余字段，用于按文档过滤）。
4. `embedding`: Float32Array — 嵌入向量。
5. `model`: string — 生成向量的模型标识。
6. `dimensions`: number — 向量维度。

### 2.4 KBConversation

1. `id`: string (ULID) — 对话唯一标识。
2. `title`: string — 对话标题（自动从首轮 query 生成或用户编辑）。
3. `turns`: KBTurn[] — 回合列表。
4. `scopeDocumentIds?`: string[] — 可选的文档范围限定（为空则检索全部文档）。
5. `createdAt`: string — 创建时间 (ISO 8601)。
6. `updatedAt`: string — 最后更新时间 (ISO 8601)。

### 2.5 KBTurn

1. `id`: string (ULID) — 回合唯一标识。
2. `role`: `'user' | 'assistant'` — 角色。
3. `content`: string — 回合文本内容。
4. `citations`: KBCitation[] — 引用列表（仅 assistant 回合）。
5. `rewrittenQuery?`: string — query rewriting 结果（仅 assistant 回合，记录改写后的检索查询）。
6. `retrievedChunkIds`: string[] — 本轮检索命中的 chunk ID 列表。
7. `timestamp`: string — 回合时间 (ISO 8601)。

### 2.6 KBCitation

1. `chunkId`: string — 引用的 chunk ID。
2. `documentId`: string — 引用的文档 ID。
3. `documentTitle`: string — 引用的文档标题（冗余字段，方便 UI 展示）。
4. `snippet`: string — 引用片段文本。
5. `score`: number — 相似度分数（0-1，cosine similarity）。
6. `refIndex`: number — 引用序号（从 1 开始，用于 `[1]` `[2]` 内联标注）。

### 2.7 KBSettings

1. `chunkSize`: number — 分块目标大小（默认 512 tokens）。
2. `chunkOverlap`: number — 分块重叠（默认 64 tokens）。
3. `topK`: number — 检索返回前 K 个结果（默认 5）。
4. `similarityThreshold`: number — 最低相似度阈值（默认 0.3）。
5. `embeddingRouteSource`: `'auto' | 'local-runtime' | 'token-api'` — embedding 路由来源（默认 `'auto'`，即 cloud-first）。
6. `maxContextChunks`: number — 注入 prompt 的最大 chunk 数（默认 8）。
7. `queryRewritingEnabled`: boolean — 是否启用多轮 query rewriting（默认 `true`）。

## 3. 文档摄入管线

### 3.1 入口

1. **文件选择器**：支持 `txt/md/pdf/docx/html/csv/json/epub/rtf`。
2. **粘贴**：直接粘贴文本内容，`sourceKind='paste'`。
3. **URL 抓取**：输入 URL，浏览器端 fetch → 提取正文，`sourceKind='url'`。

### 3.2 处理管线（状态机）

```
pending → parsing → chunking → embedding → ready
  ↓         ↓          ↓           ↓
  error    error      error      error
```

1. `pending`：文档已创建，等待处理。
2. `parsing`：格式解析中（PDF → 文本、DOCX → 文本、HTML → 纯文本等）。
3. `chunking`：文本分块中（按 `chunkSize` + `chunkOverlap` 切分）。
4. `embedding`：向量化中（通过 `generateEmbedding` 批量生成）。
5. `ready`：全部 chunk 已向量化，可检索。
6. `error`：任一阶段失败，记录 `errorReason`，可重试。

### 3.3 格式解析规则

1. `text/plain`, `text/markdown`：直接读取。
2. `application/pdf`：浏览器端 PDF.js 提取文本（保留页码元数据）。
3. `application/vnd.openxmlformats-officedocument.wordprocessingml.document`：浏览器端 DOCX 解析库提取文本。
4. `text/html`：DOM 解析 + 正文抽取（移除导航/广告/脚本）。
5. `text/csv`：按行解析，`rowRange` 记录行范围。
6. `application/json`：JSON.stringify 序列化为文本。
7. `application/epub+zip`：EPUB 解析库提取章节文本。
8. `application/rtf`：RTF 解析库提取纯文本。
9. 不支持的格式必须 fail-close，设置 `errorReason='KB_FORMAT_UNSUPPORTED'`。

### 3.4 分块规则

1. 目标大小由 `KBSettings.chunkSize` 控制（默认 512 tokens）。
2. 重叠窗口由 `KBSettings.chunkOverlap` 控制（默认 64 tokens）。
3. 分块优先在段落/句子边界切分，避免截断语义单元。
4. 单个 chunk 不超过 `chunkSize * 1.5` tokens 硬上限。
5. 空白 chunk（trimmed 后为空）必须跳过，不产生 KBChunk 记录。

### 3.5 Embedding 批处理规则

1. 通过 `@nimiplatform/sdk/mod/ai.generateEmbedding` 批量调用。
2. 单批最多 32 个 chunk（避免单次请求过大）。
3. 批次间可插入 yield 以避免阻塞 UI 线程。
4. 失败的批次记录失败 chunk 范围，允许从断点重试。
5. 所有 chunk embedding 完成后文档状态转为 `ready`。

## 4. RAG 管线

### 4.1 Query Rewriting（多轮上下文）

1. 当 `KBSettings.queryRewritingEnabled=true` 且对话存在历史回合时，执行 query rewriting。
2. 使用 `generateText` 将当前用户 query + 最近 N 轮历史改写为独立的检索查询。
3. 改写后的 query 存入 `KBTurn.rewrittenQuery`，同时用于向量检索。
4. 若 query rewriting 失败，降级使用原始 query，不阻断主链路。

### 4.2 向量检索

1. 将检索 query（rewritten 或 original）通过 `generateEmbedding` 生成查询向量。
2. 在 IndexedDB 中对所有 KBVector（或 `scopeDocumentIds` 限定范围）执行 cosine similarity 计算。
3. 按 score 降序排列，取 `topK` 个结果。
4. 过滤 `score < similarityThreshold` 的结果。
5. 检索结果 chunk ID 列表存入 `KBTurn.retrievedChunkIds`。

### 4.3 Prompt 构造

1. 系统 prompt 包含 RAG 角色指令：基于提供的上下文回答用户问题，引用来源。
2. 将检索到的 chunk 按 score 降序注入 prompt，最多 `maxContextChunks` 个。
3. 每个 chunk 以 `[Ref N] (文档标题)` 前缀标注，供模型引用。
4. 用户 query 置于 context 之后。
5. prompt 总 token 数不超过模型上下文窗口限制（由 route 决定），超出时按 score 从低到高裁剪 chunk。

### 4.4 流式生成

1. 通过 `streamText` 流式生成回答。
2. 生成完成后解析 assistant 回复中的引用标注（`[1]` `[2]` 等）。
3. 将引用标注映射回 chunk，构造 `KBCitation[]` 列表。
4. assistant turn 完整记录 `content`, `citations`, `retrievedChunkIds`。

### 4.5 引用标注规则

1. assistant 回复中使用 `[N]` 格式内联引用。
2. `refIndex` 从 1 开始连续编号，按 chunk 在 prompt 中的注入顺序。
3. 同一 chunk 在同一回复中多次引用使用相同 `refIndex`。
4. UI 展示时 citation 可点击跳转到源文档对应位置。

## 5. Hook 能力契约（与 `mod.manifest.yaml` 对齐）

### 5.1 Mod 身份

1. `id`: `world.nimi.knowledge-base`
2. `name`: `Knowledge Base`
3. `version`: `1.0.0`
4. `kind`: `capability-mod`
5. `icon`: `knowledge-base`
6. `entry`: `./dist/mods/knowledge-base/index.js`
7. 源码 manifest 与 root manifest 保持语义一致。

### 5.2 Manifest capabilities（运行时真实键）

AI 能力：

1. `llm.text.generate`
2. `llm.text.stream`
3. `llm.embedding.generate`

数据能力（register + query 成对）：

4. `data.register.data-api.knowledge-base.documents.list`
5. `data.query.data-api.knowledge-base.documents.list`
6. `data.register.data-api.knowledge-base.documents.import`
7. `data.query.data-api.knowledge-base.documents.import`
8. `data.register.data-api.knowledge-base.documents.delete`
9. `data.query.data-api.knowledge-base.documents.delete`
10. `data.register.data-api.knowledge-base.search`
11. `data.query.data-api.knowledge-base.search`
12. `data.register.data-api.knowledge-base.conversations.list`
13. `data.query.data-api.knowledge-base.conversations.list`
14. `data.register.data-api.knowledge-base.conversations.get`
15. `data.query.data-api.knowledge-base.conversations.get`
16. `data.register.data-api.knowledge-base.conversations.upsert`
17. `data.query.data-api.knowledge-base.conversations.upsert`
18. `data.register.data-api.knowledge-base.conversations.delete`
19. `data.query.data-api.knowledge-base.conversations.delete`

路由能力：

20. `data.query.data-api.runtime.route.options`

UI 能力：

21. `ui.register.ui-extension.app.sidebar.mods`
22. `ui.register.ui-extension.app.content.routes`

### 5.3 AI 依赖声明

1. `ai.consume`: `chat | embedding`
2. 当前 manifest 未声明 `ai.dependencies`（由 runtime route 与全局 runtime 配置解析具体模型）。
3. 若后续引入 `ai.dependencies`，必须在同一变更中同步更新 `mod.manifest.yaml` 与本文件。
4. 不声明、不触发模型生命周期写操作。

### 5.4 SDK 调用面（非 capability 键）

1. `@nimiplatform/sdk/mod/ai.generateText`
2. `@nimiplatform/sdk/mod/ai.streamText`
3. `@nimiplatform/sdk/mod/ai.generateEmbedding`

## 6. 数据 API 契约

### 6.1 `data-api.knowledge-base.documents.list`

查询参数：

1. `status?`: 按文档状态过滤。
2. `tags?`: 按标签过滤（AND 语义）。
3. `sortBy?`: `'createdAt' | 'updatedAt' | 'title'`（默认 `'updatedAt'`）。
4. `sortOrder?`: `'asc' | 'desc'`（默认 `'desc'`）。

返回：`KBDocument[]`

### 6.2 `data-api.knowledge-base.documents.import`

输入：

1. `file?`: File 对象（文件选择器模式）。
2. `text?`: string（粘贴模式）。
3. `url?`: string（URL 抓取模式）。
4. `title?`: string（可选标题覆盖）。
5. `tags?`: string[]（初始标签）。

返回：`KBDocument`（初始状态 `pending`）

硬约束：三种输入模式互斥，必须恰好提供一种。

### 6.3 `data-api.knowledge-base.documents.delete`

输入：

1. `documentId`: string — 要删除的文档 ID。

行为：级联删除关联的 KBChunk 和 KBVector 记录。

### 6.4 `data-api.knowledge-base.search`

输入：

1. `query`: string — 搜索查询文本。
2. `topK?`: number — 返回数量（默认使用 `KBSettings.topK`）。
3. `documentIds?`: string[] — 限定检索范围。
4. `threshold?`: number — 最低相似度阈值。

返回：`{ chunks: Array<KBChunk & { score: number; documentTitle: string }> }`

此 API 是跨 mod 集成的主要消费入口。

### 6.5 `data-api.knowledge-base.conversations.list`

返回：`KBConversation[]`（不含 turns，仅 id/title/createdAt/updatedAt）

### 6.6 `data-api.knowledge-base.conversations.get`

输入：

1. `conversationId`: string

返回：`KBConversation`（含完整 turns）

### 6.7 `data-api.knowledge-base.conversations.upsert`

输入：

1. `conversation`: `Partial<KBConversation> & { id?: string }`

行为：`id` 存在则更新，不存在则创建。

### 6.8 `data-api.knowledge-base.conversations.delete`

输入：

1. `conversationId`: string

行为：删除对话及其所有 turns。

## 7. 跨 Mod 集成

### 7.1 与 local-chat 的集成协议

1. local-chat 通过 `data.query.data-api.knowledge-base.search` 查询 KB 检索结果。
2. 挂载时机：对话级挂载——用户在 local-chat 会话中显式启用 KB 搜索。
3. local-chat 将 KB 检索结果作为额外上下文注入到 agent 对话 prompt 中。
4. KB mod 不主动参与 local-chat turn hook——不做 Turn Hook 集成。

### 7.2 消费模式

1. 其他 mod 只通过 `data.query.data-api.knowledge-base.search` 消费 KB 能力。
2. KB mod 作为 data provider 注册搜索能力，消费方无需了解内部实现。
3. 消费方传入 query 文本，KB mod 内部完成 embedding + cosine similarity + 结果返回。

### 7.3 Runtime Route 查询

1. KB mod 通过 `data.query.data-api.runtime.route.options` 查询可用的 embedding 与 chat 路由。
2. 路由选择遵循 mod 本地 route override（若有），否则使用全局默认路由。

## 8. UI 规格

### 8.1 Sidebar 入口

1. 通过 `ui.register.ui-extension.app.sidebar.mods` 注册侧边栏图标入口。
2. 图标：`knowledge-base`。
3. 点击进入 KB 主界面。

### 8.2 内容路由

1. 通过 `ui.register.ui-extension.app.content.routes` 注册以下路由：
   - `/knowledge-base` — 文档管理主页（默认）
   - `/knowledge-base/chat` — 问答对话页
   - `/knowledge-base/chat/:conversationId` — 指定对话
   - `/knowledge-base/settings` — 设置页

### 8.3 文档管理页

1. 文档列表：展示所有 KBDocument，按 `updatedAt` 降序。
2. 状态标签：显示每个文档的处理状态（`pending`/`parsing`/`chunking`/`embedding`/`ready`/`error`）。
3. 导入按钮：触发文件选择器 / 粘贴面板 / URL 输入。
4. 删除操作：需二次确认。
5. 标签管理：支持添加/移除文档标签。
6. 错误重试：`error` 状态文档显示重试按钮。

### 8.4 问答对话页

1. 对话列表侧栏：展示所有 KBConversation，支持新建/切换/删除。
2. 消息流：user/assistant 回合交替展示。
3. 引用标注：assistant 回复中 `[N]` 可点击，展开引用详情（文档标题 + snippet + score）。
4. 文档范围选择器：可选限定检索范围到特定文档。
5. 输入框：支持文本输入 + 发送。

### 8.5 设置页

1. 分块参数：`chunkSize`, `chunkOverlap` 调整。
2. 检索参数：`topK`, `similarityThreshold`, `maxContextChunks` 调整。
3. Embedding 路由：`embeddingRouteSource` 选择。
4. Query rewriting：开关控制。
5. 参数修改后已有文档不自动重新处理；需用户显式触发重新 embedding。

## 9. 行为规则

### 9.1 文档状态机

1. 状态只能沿管线单向前进：`pending → parsing → chunking → embedding → ready`。
2. 任一阶段失败转入 `error`，用户可从 `error` 触发重试，从失败阶段重新开始。
3. 删除文档时无论处于何种状态，均级联清理 chunk 和 vector 数据。
4. 文档处理为异步操作，UI 必须展示进度状态。

### 9.2 Chunking 参数

1. `chunkSize` 范围：128-2048 tokens。
2. `chunkOverlap` 范围：0-256 tokens。
3. `chunkOverlap` 必须小于 `chunkSize`。
4. 修改参数不影响已处理文档；重新 embedding 需用户显式触发。

### 9.3 检索阈值

1. `similarityThreshold` 范围：0.0-1.0。
2. `topK` 范围：1-20。
3. 检索返回结果为空时，assistant 必须明确告知用户未找到相关内容，不允许凭空回答。

### 9.4 多轮上下文管理

1. Query rewriting prompt 最多包含最近 5 轮对话历史。
2. Query rewriting 结果记录在 `KBTurn.rewrittenQuery`，供审计追溯。
3. 对话 prompt 除 RAG context 外，还包含最近 3 轮对话历史以维持连贯性。
4. 新对话首轮不执行 query rewriting，直接使用原始 query。

### 9.5 Embedding 批处理

1. 单批上限 32 个 chunk。
2. 批次间 yield 防止 UI 阻塞。
3. 断点重试：记录已完成的 chunk 范围，失败后从断点续传。
4. 所有 embedding 完成后文档状态转为 `ready`。

### 9.6 IndexedDB 存储

1. 使用单一 IndexedDB 数据库：`knowledge-base-db`。
2. Object stores：`documents`, `chunks`, `vectors`, `conversations`, `settings`。
3. `vectors` store 使用 `documentId` 索引以支持按文档过滤。
4. 向量数据以 `Float32Array` 序列化存储。
5. IndexedDB 存储容量受浏览器限制，文档总量超过可用空间时必须给出明确错误提示。

## 10. 隐私与安全

1. 文档原文与分块文本仅存储在浏览器 IndexedDB 中，不离开设备。
2. Embedding 请求发送的是文本片段（chunk text），经由 `@nimiplatform/sdk/mod/ai.generateEmbedding` 路由到 embedding provider；用户需知晓 cloud-first 模式下文本会发送到远端。
3. 设置页必须在 `embeddingRouteSource` 选项旁明示：`token-api` 模式下文本会经由 nimi token-api 发送到 embedding 提供商。
4. 不得在未经用户确认的情况下自动上传文档原文到任何后端。
5. 导出能力仅允许用户显式触发（JSON export），禁止后台自动上报或同步。
6. 不得在前端持久化明文第三方 API key。
7. 对话历史（包含 assistant 回复与引用）同样仅本地存储。

## 11. 审计与诊断

### 11.1 最小审计事件集

1. `kb.document.import.started`
2. `kb.document.import.failed`
3. `kb.document.import.succeeded`
4. `kb.document.parsing.started`
5. `kb.document.parsing.failed`
6. `kb.document.embedding.started`
7. `kb.document.embedding.failed`
8. `kb.document.embedding.succeeded`
9. `kb.document.deleted`
10. `kb.search.executed`
11. `kb.conversation.created`
12. `kb.conversation.deleted`
13. `kb.turn.sent`
14. `kb.turn.assistant.completed`
15. `kb.turn.assistant.failed`
16. `kb.query-rewrite.executed`
17. `kb.query-rewrite.failed`
18. `kb.settings.updated`

### 11.2 最小 reasonCode 集

1. `KB_FORMAT_UNSUPPORTED` — 不支持的文件格式。
2. `KB_PARSING_FAILED` — 文件解析失败。
3. `KB_CHUNKING_FAILED` — 文本分块失败。
4. `KB_EMBEDDING_FAILED` — 向量化失败（路由不可用或 provider 错误）。
5. `KB_EMBEDDING_ROUTE_UNAVAILABLE` — embedding 路由不可用。
6. `KB_SEARCH_EMPTY` — 检索结果为空或全部低于阈值。
7. `KB_SEARCH_FAILED` — 检索执行失败。
8. `KB_AI_GENERATE_FAILED` — 回答生成失败。
9. `KB_QUERY_REWRITE_FAILED` — query rewriting 失败。
10. `KB_STORAGE_QUOTA_EXCEEDED` — IndexedDB 存储空间不足。
11. `KB_DOCUMENT_NOT_FOUND` — 文档不存在。
12. `KB_CONVERSATION_NOT_FOUND` — 对话不存在。

## 12. 验收标准（必须全部满足）

### 12.1 能力面

1. manifest capabilities 与源码常量一致，且通过 runtime 注册。
2. 22 个 capability 键全部在 manifest 与源码中声明。
3. `generateEmbedding` 调用正常路由到 embedding provider。

### 12.2 结果面

1. 文档摄入管线完整：文件选择/粘贴/URL → 解析 → 分块 → embedding → `ready`。
2. RAG 检索返回带 score 的 chunk 列表，引用标注可追溯到源文档。
3. 多轮对话 query rewriting 正确改写查询，检索结果符合上下文。

### 12.3 失败面

1. 任何失败返回结构化 `reasonCode`。
2. 文档处理失败可重试，不丢失已完成步骤的数据。
3. Embedding 路由不可用时给出明确提示，不静默失败。

### 12.4 隐私面

1. 文档原文不离开 IndexedDB。
2. `token-api` 模式下有明确的用户告知。
3. 无隐式上传行为。

### 12.5 集成面

1. local-chat 可通过 `data.query.data-api.knowledge-base.search` 查询 KB。
2. 搜索 API 返回结构化结果，消费方无需了解内部实现。
3. KB mod 不参与 local-chat turn hook，仅提供按需查询。

## 13. 与其他 SSOT 对齐

1. `@nimiplatform/nimi/ssot/mod/governance.md` 仅定义通用 Mod 治理规则；Knowledge-Base 业务规范由本文件定义。
2. `spec/runtime/kernel/knowledge-contract.md`（K-KNOW-*）定义 RuntimeKnowledgeService 接口；KB mod 独立实现向量存储，不消费该服务（Phase 1）。
3. `spec/desktop/kernel/hook-capability-contract.md`（D-HOOK-*）定义 Hook 能力模型；KB mod 遵循但不重定义。
4. `@nimiplatform/nimi-mods/local-chat/SSOT.md` 定义 local-chat 业务；KB 与 local-chat 的集成协议见本文件 §7。
5. `@nimiplatform/nimi/ssot/runtime/local-runtime.md` 定义路由语义；KB mod 消费但不定义路由协议。
