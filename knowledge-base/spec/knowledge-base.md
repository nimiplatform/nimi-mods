# Knowledge Base — Domain Overview

> Thin domain document. Business rules defined in `kernel/` contracts.

## Positioning

Knowledge Base 是运行于 Nimi Desktop zero-bundle mod host 的私有本地知识库 runtime mod，提供文档摄入、语义检索、多轮 RAG 问答全链路。所有数据仅存储在浏览器 IndexedDB 中，不离开设备。

## Module Map

```
knowledge-base/
├── src/
│   ├── index.ts, runtime-mod.ts, manifest.ts   # 入口与注册
│   ├── types.ts, contracts.ts                    # 实体与能力定义 → KB-DOM-*, KB-CAP-*
│   ├── adapters/                                 # SDK → 服务层桥接
│   │   ├── llm-adapter.ts                        # ModRuntimeClient → LlmClient
│   │   └── embedding-adapter.ts                  # ModRuntimeClient → EmbeddingClient
│   ├── controllers/                              # React hooks 编排层
│   │   ├── use-kb-page-controller.ts             # 顶层 facade
│   │   ├── use-kb-clients.ts                     # 路由解析 + adapter 创建
│   │   ├── use-kb-ui-state.ts                    # 临时 UI 状态
│   │   ├── use-document-actions.ts               # 文档导入/删除/重试
│   │   └── use-chat-actions.ts                   # 对话创建/发送/删除
│   ├── services/                                 # 纯业务逻辑 → KB-PIPE-*, KB-RAG-*
│   │   ├── document-parser.ts                    # 格式解析（KB-PIPE-002）
│   │   ├── chunker.ts                            # 文本分块（KB-PIPE-003）
│   │   ├── document-pipeline.ts                  # 处理管线编排（KB-PIPE-001）
│   │   ├── embedding-pipeline.ts                 # 批量向量化（KB-PIPE-004）
│   │   ├── vector-store.ts                       # In-memory 向量检索（KB-PIPE-005）
│   │   ├── query-rewriter.ts                     # Query rewriting（KB-RAG-002）
│   │   ├── rag-pipeline.ts                       # RAG 主管线（KB-RAG-001, 003, 004）
│   │   └── citation-parser.ts                    # 引用解析（KB-RAG-005）
│   ├── state/                                    # Zustand + IndexedDB
│   │   ├── knowledge-base-store.ts               # 全局状态
│   │   └── indexed-db.ts                         # 持久化 CRUD
│   ├── registrars/
│   │   └── data.ts                               # Data-API 注册（KB-CAP-003~005）
│   ├── components/                               # React UI
│   │   ├── shared/                               # Shell + NavTabs
│   │   ├── documents/                            # 文档列表 + 卡片 + 导入
│   │   ├── chat/                                 # 对话侧边栏 + 消息流 + 引用
│   │   ├── settings/                             # 设置卡片
│   │   └── ui/                                   # Radix UI 封装（Button, Dialog, Badge, Progress, Tooltip）
│   └── logging.ts                                # Flow ID + 结构化日志
├── spec/                                         # 本 spec 目录
├── test/                                         # 测试
├── mod.manifest.yaml                             # Manifest 定义
└── package.json
```

## Normative Imports

- Capability boundary: `kernel/capability-contract.md` (`KB-CAP-*`)
- Core entities: `kernel/domain-contract.md` (`KB-DOM-*`)
- Document pipeline: `kernel/pipeline-contract.md` (`KB-PIPE-*`)
- RAG pipeline: `kernel/rag-contract.md` (`KB-RAG-*`)
- Error semantics: `kernel/error-model.md` (`KB-ERR-*`)
- Acceptance gates: `kernel/acceptance-contract.md` (`KB-ACC-*`)

## Kernel Reading Paths

- **实体定义**：`kernel/domain-contract.md`（KB-DOM-001~007）+ `kernel/tables/entities.yaml`
- **文档处理**：`kernel/pipeline-contract.md`（KB-PIPE-001~005）+ `kernel/tables/pipeline-states.yaml`
- **RAG 管线**：`kernel/rag-contract.md`（KB-RAG-001~005）
- **能力与集成**：`kernel/capability-contract.md`（KB-CAP-001~008）+ `kernel/tables/capabilities.yaml`
- **错误语义**：`kernel/error-model.md`（KB-ERR-001~004）+ `kernel/tables/reason-codes.yaml`
- **验收门**：`kernel/acceptance-contract.md`（KB-ACC-001~002）+ `kernel/tables/acceptance-cases.yaml`

## Non-Goals (V1)

- PDF / EPUB / DOCX / RTF 格式解析（未实现，仅支持 txt/md/csv/json/html）
- 云端同步与多设备共享
- 协作知识库与多人编辑
- Runtime RuntimeKnowledgeService 消费（K-KNOW Phase 1 限制）
- Turn Hook 集成（仅提供按需查询 API）
- OCR（扫描件处理）

## Tech Stack

| Layer | Technology |
|-------|-----------|
| UI | React 19 + Tailwind 4 + Radix UI (Dialog, Progress, Tooltip) |
| State | Zustand + IndexedDB (`knowledge-base-db` v1) |
| AI | `@nimiplatform/sdk/mod/runtime` (`runtime.ai.text.generate/stream`, `runtime.ai.embedding.generate`) |
| Vector Search | In-memory cosine similarity (VectorStore class) |
| Routing | Tab-based (Documents / Chat / Settings) via Zustand `activeTab` |
