# Knowledge Base Pipeline Contract

> Owner Domain: `KB-PIPE-*`
> Authoritative source: `tables/pipeline-states.yaml`, `tables/reason-codes.yaml`

---

## KB-PIPE-001 — 文档处理管线

文档从导入到可检索经历五个阶段：

| Step | State | 入口条件 | 输出 |
|------|-------|----------|------|
| 0 | pending | 文档创建完成 | — |
| 1 | parsing | 自动触发 | 纯文本内容 |
| 2 | chunking | 解析成功 | KBChunk[] |
| 3 | embedding | 分块成功 | KBVector[] |
| 4 | ready | 全部向量化完成 | 可检索文档 |

- 状态机遵循 `tables/pipeline-states.yaml` 定义的转换规则。
- 任一阶段失败转入 `error` 状态，记录 `errorReason`（参考 `tables/reason-codes.yaml`）。
- 用户可从 `error` 触发重试，当前实现为重新导入。

## KB-PIPE-002 — 格式解析

将不同 MIME 类型的文档转换为纯文本。

- `text/plain`、`text/markdown`：直接读取文本。
- `text/csv`：保持原始格式。
- `application/json`：`JSON.parse` → `JSON.stringify(data, null, 2)` 格式化。
- `text/html`：浏览器端 `DOMParser` 解析 + 正文抽取（移除 `script`/`style`/`nav`/`footer`/`header`/`aside` 标签）；无 `DOMParser` 时使用正则回退。
- 不支持的格式 fail-close，设置 `errorReason='KB_FORMAT_UNSUPPORTED'`。
- MIME 类型由文件扩展名猜测：`.txt`→`text/plain`、`.md`→`text/markdown`、`.csv`→`text/csv`、`.json`→`application/json`、`.html`/`.htm`→`text/html`。

## KB-PIPE-003 — 文本分块

将纯文本按语义边界切分为 chunk。

- 分割策略：以 `\n{2,}`（双换行）为段落边界。
- 贪心累积：逐段落累积直到下一段落会超过 `chunkSize`。
- 重叠窗口：chunk 边界处从尾部段落计算不超过 `chunkOverlap` tokens 的重叠。
- Token 估算：1 token ≈ 4 characters（`estimateTokens(text) = Math.ceil(text.length / 4)`）。
- 空白 chunk（trimmed 后为空）自动跳过。
- 常量：`chunkSize` 默认 512 tokens，`chunkOverlap` 默认 64 tokens。

## KB-PIPE-004 — Embedding 批处理

将 chunk 文本批量转换为向量。

- 通过 `@nimiplatform/sdk/mod` 的 `runtime.ai.embedding.generate` 调用。
- 单批上限 BATCH_SIZE = 32 个 chunk。
- 批次间 yield（`setTimeout(0)`）防止 UI 线程阻塞。
- 每批完成后回调 `onEmbeddingProgress` 报告进度。
- 批次失败记录失败 chunk 范围，抛出含批次上下文的错误。
- 所有批次完成后文档状态转为 `ready`。

## KB-PIPE-005 — 向量存储

浏览器端 in-memory 向量检索 + mod host sqlite 持久化。

- `VectorStore` 类维护 `Map<string, KBVector>` 内存索引。
- `search(queryEmbedding, topK, threshold, documentIds?)` 执行余弦相似度全扫描。
- 余弦相似度公式：`dot(a, b) / (||a|| * ||b||)`，返回 [-1, 1]。
- 按 score 降序排列，过滤 `score < threshold`，取 `topK` 个结果。
- `documentIds` 可选参数限定检索范围。
- `removeByDocumentId(docId)` 支持级联清理。
- 持久化后端：Knowledge Base 专属宿主 sqlite，逻辑上保存 `documents`、`chunks`、`vectors`、`conversations`、`settings`。
- `vectors` store 使用 `documentId` 索引。
- `Float32Array` 序列化为 `number[]` 存储，读取时恢复。
