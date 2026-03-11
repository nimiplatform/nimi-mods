# Knowledge Base RAG Contract

> Owner Domain: `KB-RAG-*`
> Authoritative source: `tables/reason-codes.yaml`

---

## KB-RAG-001 — RAG 管线概览

RAG（Retrieval-Augmented Generation）管线将用户查询转化为基于源文档的回答。

```
query → [rewriting] → embedding → vector search → prompt build → LLM stream → citation parse → done
```

- 管线以 async generator 实现，yield `RagStreamEvent`（`search_complete` | `text_delta` | `done`）。
- 失败时通过 error event 报告，不阻断 UI。

## KB-RAG-002 — Query Rewriting

将多轮对话中的上下文相关查询改写为独立的检索查询。

- 触发条件：`queryRewritingEnabled=true` 且对话存在历史回合。
- 上下文窗口：最近 5 轮对话历史（交替 user/assistant）。
- LLM 调用：`generateText`，temperature=0.1，system prompt 指示"Output ONLY the rewritten query"。
- 改写结果存入 `KBTurn.rewrittenQuery`。
- 首轮对话不执行 rewriting，直接使用原始 query。
- **降级策略**：rewriting 失败时使用原始 query，不阻断主链路。错误码 `KB_QUERY_REWRITE_FAILED` 仅记录日志。

## KB-RAG-003 — 向量检索

将查询向量与文档 chunk 向量进行余弦相似度匹配。

- 查询 embedding：通过 `generateEmbedding` 生成单个查询向量。
- 检索范围：全部文档，或由 `KBConversation.scopeDocumentIds` 限定。
- 排序：按 score 降序。
- 过滤：`score < similarityThreshold` 的结果被丢弃。
- 截断：取 `topK` 个结果。
- 检索结果为空时：assistant 明确告知用户未找到相关内容，不允许凭空回答。
- chunk ID 列表存入 `KBTurn.retrievedChunkIds`。

## KB-RAG-004 — Prompt 构造与流式生成

将检索到的 chunk 和对话历史注入 LLM prompt，流式生成回答。

- **System prompt**：RAG 角色指令——基于提供的上下文回答，使用 `[N]` 格式引用来源。
- **Context 注入**：检索到的 chunk 按 score 降序排列，每个以 `[Ref N] (文档标题)` 前缀标注，最多 `maxContextChunks` 个。
- **对话历史**：最近 3 轮（SSOT §9.4 rule 3）以维持连贯性。
- **生成参数**：`streamText`，temperature=0.3。
- 无检索结果时：system prompt 指示"告知用户未找到匹配内容"。

## KB-RAG-005 — Citation 解析

从 LLM 回复文本中提取 `[N]` 引用标注并映射到源 chunk。

- 正则匹配 `\[(\d+)\]` 模式。
- `refIndex` 基于 chunk 在 prompt 中的注入顺序（1-based）。
- `snippet` 取 chunk 文本前 200 字符。
- 去重：同一 chunk 多次引用保留首次 `refIndex`。
- 缺失引用（refIndex 超出范围）静默跳过。
- 最终 `KBCitation[]` 存入 `KBTurn.citations`。
