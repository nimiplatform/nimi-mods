# Knowledge Base Domain Contract

> Owner Domain: `KB-DOM-*`
> Authoritative source: `tables/entities.yaml`

---

## KB-DOM-001 — KBDocument

文档是知识库的基本单元，从用户导入的文件/文本/URL 创建。

- 每个文档具有唯一 ULID 标识。
- `sourceKind` 区分三种导入来源：`file`（文件上传）、`paste`（文本粘贴）、`url`（URL 抓取）。
- `status` 遵循 `tables/pipeline-states.yaml` 定义的状态机。
- `errorReason` 仅在 `error` 状态时有值，取值遵循 `tables/reason-codes.yaml`。
- 删除文档时级联清理所有关联 KBChunk 和 KBVector 记录。
- 当前支持的 MIME 类型：`text/plain`、`text/markdown`、`text/csv`、`application/json`、`text/html`。

## KB-DOM-002 — KBChunk

分块是文档经文本分割后的语义片段，是 embedding 和检索的最小单元。

- 每个 chunk 通过 `documentId` 关联到源文档。
- `chunkIndex` 从 0 开始，表示在源文档中的顺序。
- `tokenCount` 为估算值（1 token ≈ 4 characters）。
- `metadata` 包含可选的结构化位置信息（标题、页码、行范围）。
- 空白 chunk（trimmed 后为空）必须跳过，不产生记录。

## KB-DOM-003 — KBVector

向量记录保存 chunk 的 embedding 结果，用于余弦相似度检索。

- `embedding` 使用 `Float32Array` 存储。
- `documentId` 为冗余字段，用于按文档过滤检索范围。
- `model` 记录生成向量的模型标识，供审计追溯。
- IndexedDB 中以 `number[]` 序列化存储，读取时恢复为 `Float32Array`。

## KB-DOM-004 — KBConversation

对话是用户与知识库助手的多轮交互容器。

- 标题从首轮 query 自动生成，用户可通过双击重命名。
- `scopeDocumentIds` 可选限定检索范围到特定文档子集。
- 按 `updatedAt` 降序排列展示。
- 删除对话时同时清理所有 turns。

## KB-DOM-005 — KBTurn

回合是对话中的单次用户提问或助手回答。

- `role` 严格为 `'user'` 或 `'assistant'`。
- `citations` 仅 assistant 回合有值，记录 LLM 回复中引用的源文档片段。
- `rewrittenQuery` 仅 assistant 回合有值，记录 query rewriting 改写后的检索查询（供审计）。
- `retrievedChunkIds` 记录本轮向量检索命中的 chunk ID 列表。

## KB-DOM-006 — KBCitation

引用记录将 assistant 回复中的 `[N]` 标注映射回源文档 chunk。

- `refIndex` 从 1 开始连续编号，按 chunk 在 prompt 中的注入顺序。
- `snippet` 为 chunk 文本的前 200 字符预览。
- `score` 为余弦相似度分数（0-1）。
- 同一 chunk 在同一回复中多次引用使用相同 `refIndex`。

## KB-DOM-007 — KBSettings

设置控制分块、检索和路由行为，持久化到 IndexedDB `settings` store。

- **分块参数**：`chunkSize`（128-2048 tokens）、`chunkOverlap`（0-256 tokens，必须小于 chunkSize）。
- **检索参数**：`topK`（1-20）、`similarityThreshold`（0.0-1.0）、`maxContextChunks`。
- **路由参数**：`chatRouteSource`/`embeddingRouteSource`（`auto`|`local-runtime`|`token-api`），配套 `connectorId` 和 `model` 字段。
- `queryRewritingEnabled` 控制多轮 query rewriting 开关。
- 修改分块参数不影响已处理文档；需用户显式重新导入。
