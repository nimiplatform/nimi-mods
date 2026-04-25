---
title: Nimi Knowledge-Base Mod SSOT
status: ACTIVE
version: v1.0
updated_at: 2026-03-04
rules:
  - KB 业务执行真相唯一归属本文件；`spec/platform/kernel/governance-contract.md` 仅定义 Mod 通用治理规则。
  - KB 执行主路径固定在 `nimi-mods/runtime/knowledge-base`，不得以独立网页壳替代 Nimi runtime mod 形态。
  - 文档数据默认仅本地处理（宿主 sqlite），不隐式上传；导出/分享必须由用户显式触发。
  - AI 调用入口统一为 `@nimiplatform/sdk/mod`（`runtime.ai.text.*` / `runtime.ai.embedding.generate`），不保留 legacy 场景调用兼容路径。
  - 搜索能力通过 `data.register` 暴露为 data-api capability，不使用 `inter-mod.provide`。
  - Embedding 路由默认 cloud-first（cloud），预留 local 接口；路由来源由 `RuntimeRouteBinding` 控制，不硬编码 provider。
  - 向量检索使用 cosine similarity 浏览器端实现，不依赖 runtime RuntimeKnowledgeService（K-KNOW Phase 1 仅 in-memory + substring matching）。
  - 多轮对话通过 query rewriting 实现上下文连贯；rewritten query 记录在 turn 中供审计。
  - Hook 客户端创建入口统一为 `createHookClient(modId)`，不得恢复历史命名与中间别名。
  - KB 作为 external/default mod 时，必须保持 `manifest + entry + dist` 统一加载链路，不恢复 builtin 专用路径。
  - KB 对外稳定调用面固定为 `@nimiplatform/sdk/mod`，shell/lifecycle 仅在需要时单独使用；禁止 `mod/ui` 与 host/internal 直连。
  - KB 的 root manifest 与源码 manifest 必须语义一致（版本、能力集合、ai 依赖声明）。
  - KB 代码组织固定为 `components/state/services/hooks` 分层；页面文件只保留容器装配，业务编排下沉到 controller hooks。
  - KB 禁止非 `index.ts/tsx` 的 re-export 壳文件；调用方必须直连真实实现模块，减少调试跳转层。
  - KB 的用户可见文案必须纳入 mod i18n；当前 zh/en 双语覆盖为强制要求。
---

# Nimi Knowledge-Base 唯一真相（SSOT）

> 私有本地知识库助手——文档摄入、语义检索、多轮 RAG 问答全链路。

## Mod 身份

| Key | Value |
|-----|-------|
| ID | `world.nimi.knowledge-base` |
| Kind | `capability-mod` |
| Version | `1.0.0` |
| Entry | `./dist/mods/knowledge-base/index.js` |
| License | MIT |

## 核心流程

```
文档导入 → 格式解析 → 文本分块 → 向量化 → 语义检索 → RAG 问答
 (file/   (txt,md,   (paragraph  (batch     (cosine    (stream +
  paste,   csv,json,  chunking    embedding)  similarity) citations)
  url)     html)      + overlap)
```

## Spec 入口

**详细规格请查阅 → [`spec/INDEX.md`](spec/INDEX.md)**

## 核心实体

| Entity | Rule ID | Description |
|--------|---------|-------------|
| KBDocument | KB-DOM-001 | 知识库文档（文件/文本/URL 来源） |
| KBChunk | KB-DOM-002 | 文本分块（embedding + 检索最小单元） |
| KBVector | KB-DOM-003 | 向量记录（Float32Array embedding） |
| KBConversation | KB-DOM-004 | 多轮对话容器 |
| KBTurn | KB-DOM-005 | 对话回合（user/assistant） |
| KBCitation | KB-DOM-006 | 引用标注（[N] → chunk 映射） |
| KBSettings | KB-DOM-007 | 分块/检索/路由设置 |

## 技术栈

| Layer | Technology |
|-------|-----------|
| UI | React 19 + Tailwind 4 + Radix UI (Dialog, Progress, Tooltip) |
| State | Zustand + host sqlite-backed mod storage (`knowledge-base.state`) |
| AI | `@nimiplatform/sdk/mod` (`runtime.ai.text.generate/stream`, `runtime.ai.embedding.generate`) |
| Vector Search | In-memory cosine similarity (VectorStore) |
| Cross-Mod | Data-API capability (search, documents, conversations) |

## V1 边界

### 包含

- txt / md / csv / json / html 文档导入（文件上传 + 文本粘贴 + URL 抓取）
- 段落分块（paragraph-based chunking with overlap）
- Embedding 向量化（batch processing, BATCH_SIZE=32）
- 余弦相似度向量检索（topK + threshold）
- 多轮 Query Rewriting（最近 5 轮上下文）
- 流式 RAG 回答 + 引用标注（[N] citations）
- 文档范围限定（scopeDocumentIds）
- 会话管理（搜索 + 重命名 + 删除确认）
- 跨 mod 搜索 API（`data.query.data-api.knowledge-base.search`）
- 22 个 capability 键注册（3 AI + 16 data + 1 route + 2 UI）

### 不包含（Future）

- PDF / EPUB / DOCX / RTF 格式解析
- Sentence-level 分块
- OCR（扫描件处理）
- 云端同步与多设备共享
- 协作知识库与多人编辑
- Runtime RuntimeKnowledgeService 消费（K-KNOW Phase 1）
- Turn Hook 集成

## 与其他 SSOT 对齐

1. `spec/platform/kernel/governance-contract.md` — 通用 Mod 治理规则；KB 业务由本文件定义。
2. `spec/runtime/kernel/knowledge-contract.md`（K-KNOW-*）— RuntimeKnowledgeService 接口；KB mod 独立实现（Phase 1）。
3. `spec/desktop/kernel/hook-capability-contract.md`（D-HOOK-*）— Hook 能力模型；KB 遵循但不重定义。
4. `spec/kernel/capability-contract.md` § KB-CAP-007 — 跨 Mod 检索集成协议。
5. `spec/runtime/kernel/local-engine-contract.md` — 路由语义；KB 消费但不定义。
