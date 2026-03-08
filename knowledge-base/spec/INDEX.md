---
mod_id: world.nimi.knowledge-base
status: Active
version: 1.0.0
---

# Knowledge Base Spec Index

私有本地知识库助手——文档摄入、语义检索、多轮 RAG 问答全链路，数据不离开设备。

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Desktop Renderer (Tauri WebView)                                │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Knowledge Base Mod                                        │   │
│  │                                                            │   │
│  │  UI Layer (React)                                          │   │
│  │  ┌────────────┐  ┌──────────┐  ┌──────────────┐          │   │
│  │  │  Documents  │  │   Chat   │  │   Settings   │          │   │
│  │  └──────┬─────┘  └────┬─────┘  └──────┬───────┘          │   │
│  │         │              │               │                   │   │
│  │  Controller Layer (hooks)                                  │   │
│  │  ┌────────────────────────────────────────────────────┐   │   │
│  │  │  useKBPageController                                │   │   │
│  │  │  ├── useDocumentActions                             │   │   │
│  │  │  ├── useChatActions                                 │   │   │
│  │  │  ├── useKBClients (LLM + Embedding adapters)        │   │   │
│  │  │  └── useKBUiState                                   │   │   │
│  │  └────────────────────────────────────────────────────┘   │   │
│  │         │              │               │                   │   │
│  │  Service Layer                                             │   │
│  │  ┌──────────┐  ┌──────────────┐  ┌──────────────┐        │   │
│  │  │ Parser   │  │ Chunker      │  │ VectorStore  │        │   │
│  │  │ Pipeline │  │ EmbedPipeline│  │ RAG Pipeline │        │   │
│  │  └──────────┘  └──────────────┘  └──────────────┘        │   │
│  │         │              │               │                   │   │
│  │  State Layer                                               │   │
│  │  ┌─────────────────────────────────────────┐              │   │
│  │  │  Zustand Store ←→ IndexedDB             │              │   │
│  │  └─────────────────────────────────────────┘              │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                    │
│  ┌───────────────────────────┴────────────────────────────┐     │
│  │  @nimiplatform/sdk/mod                                  │     │
│  │  ai (generateText, streamText, generateEmbedding)       │     │
│  │  hook (createHookClient → data, ui, event, audit)       │     │
│  └─────────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────┘
```

## Spec Structure

### Kernel (Authoritative Facts)

| Document | Rule IDs | Description |
|----------|----------|-------------|
| `kernel/index.md` | — | Rule ID format, ownership, fact sources |
| `kernel/domain-contract.md` | KB-DOM-001 ~ 007 | 7 核心实体（Document, Chunk, Vector, Conversation, Turn, Citation, Settings） |
| `kernel/pipeline-contract.md` | KB-PIPE-001 ~ 005 | 文档处理管线（解析→分块→向量化→存储） |
| `kernel/rag-contract.md` | KB-RAG-001 ~ 005 | RAG 管线（query rewriting→检索→prompt→生成→引用解析） |
| `kernel/capability-contract.md` | KB-CAP-001 ~ 008 | 能力注册、AI 消费、数据 API、跨 mod 集成、隐私约束 |
| `kernel/error-model.md` | KB-ERR-001 ~ 004 | 错误语义（reason code 注册、结构化信封、fail-close、降级） |
| `kernel/acceptance-contract.md` | KB-ACC-001 ~ 002 | 验收门（table-driven、覆盖要求） |

### Kernel Tables

| Table | Content |
|-------|---------|
| `kernel/tables/entities.yaml` | 7 实体定义（字段、类型、默认值、引用关系） |
| `kernel/tables/pipeline-states.yaml` | 双管线状态机（document 5 步 + RAG 6 步 + transitions） |
| `kernel/tables/reason-codes.yaml` | 12 个 reasonCode（blocking/non-blocking + action hint） |
| `kernel/tables/capabilities.yaml` | 22 个 capability 键（3 AI + 16 data + 1 route + 2 UI） |
| `kernel/tables/acceptance-cases.yaml` | 7 个验收用例 + 4 个 verification commands |

### Generated Views

| File | Source |
|------|--------|
| `kernel/generated/capabilities.md` | `kernel/tables/capabilities.yaml` |
| `kernel/generated/entities.md` | `kernel/tables/entities.yaml` |
| `kernel/generated/pipeline-states.md` | `kernel/tables/pipeline-states.yaml` |
| `kernel/generated/reason-codes.md` | `kernel/tables/reason-codes.yaml` |
| `kernel/generated/acceptance-cases.md` | `kernel/tables/acceptance-cases.yaml` |

### Domain Documents

| Document | Scope |
|----------|-------|
| `knowledge-base.md` | 高层定位、边界、技术栈、V1 范围 |
| `frontend.md` | UI 架构、组件树、状态管理、文件结构 |

## Reading Paths

### "理解 KB 全貌"
1. `knowledge-base.md` → 高层定位
2. `kernel/domain-contract.md` → 7 核心实体（KB-DOM-001~007）
3. `kernel/pipeline-contract.md` → 文档处理管线（KB-PIPE-001~005）
4. `kernel/rag-contract.md` → RAG 管线（KB-RAG-001~005）

### "修改文档解析逻辑"
1. `kernel/pipeline-contract.md` § KB-PIPE-002（格式解析）
2. `kernel/tables/reason-codes.yaml`（KB_FORMAT_UNSUPPORTED, KB_PARSING_FAILED）
3. 源码：`src/services/document-parser.ts`

### "修改 RAG 检索策略"
1. `kernel/rag-contract.md` § KB-RAG-003（向量检索）
2. `kernel/domain-contract.md` § KB-DOM-007（KBSettings 参数）
3. 源码：`src/services/rag-pipeline.ts`, `src/services/vector-store.ts`

### "添加新数据 API"
1. `kernel/capability-contract.md` § KB-CAP-003~005
2. `kernel/tables/capabilities.yaml`（添加新行）
3. 源码：`src/contracts.ts`, `src/registrars/data.ts`, `mod.manifest.yaml`

### "修改错误语义"
1. `kernel/error-model.md`（KB-ERR-001~004）
2. `kernel/tables/reason-codes.yaml`
3. `knowledge-base.md`

### "修改验收门"
1. `kernel/acceptance-contract.md`（KB-ACC-001~002）
2. `kernel/tables/acceptance-cases.yaml`

### "修改 UI 组件"
1. `frontend.md`（组件树 + 文件结构）
2. `kernel/domain-contract.md`（引用的实体）
3. 源码：`src/components/**`

## Verification

1. `pnpm -C nimi-mods run generate:spec:knowledge-base-kernel-docs`
2. `pnpm -C nimi-mods run check:spec:knowledge-base-kernel-docs-drift`
3. `pnpm -C nimi-mods run check:spec:knowledge-base-kernel-consistency`

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| IndexedDB 而非 Runtime KnowledgeService | K-KNOW Phase 1 仅 in-memory + substring matching，KB 需要持久化向量存储 |
| 浏览器端余弦相似度全扫描 | 文档量在 Desktop 场景下有限（<1000 docs），O(n) 扫描足够 |
| Cloud-first embedding（auto 模式） | Token-api 质量更高；local 作为离线 fallback |
| Async generator RAG 管线 | 流式输出 + 进度回调，避免 UI 阻塞 |
| Paragraph-based chunking（`\n\n` 分割） | 简单有效，保持语义完整性；未来可升级为 sentence-level |
| Adapter pattern（ModRuntimeClient → LlmClient/EmbeddingClient） | 解耦 SDK 调用与业务逻辑，便于测试和路由切换 |
| 数据 API 暴露搜索而非 Turn Hook | KB 为按需查询型，不适合 turn-level 介入 |
| Query rewriting 降级策略 | Rewriting 失败不阻断主链路，使用原始 query 继续 |
| 会话标题自动生成 + 用户可编辑 | 降低首次使用门槛，保留用户控制权 |

## V1 Scope

| Feature | V1 | Future |
|---------|:--:|:------:|
| txt/md/csv/json/html 导入 | ✓ | |
| PDF 导入 | | ✓ (pdfjs-dist) |
| EPUB/DOCX/RTF 导入 | | ✓ |
| 文本粘贴 + URL 抓取 | ✓ | |
| 段落分块 + 重叠窗口 | ✓ | |
| Sentence-level 分块 | | ✓ |
| Embedding 向量化 | ✓ | |
| 余弦相似度检索 | ✓ | |
| 多轮 Query Rewriting | ✓ | |
| 流式 RAG 回答 + 引用 | ✓ | |
| 会话搜索 + 重命名 | ✓ | |
| 文档范围限定 | ✓ | |
| 跨 mod 搜索 API | ✓ | |
| 多设备同步 | | ✓ |
| 协作知识库 | | ✓ |
| OCR（扫描件 PDF） | | ✓ |

## Dependencies

| Capability Key | Usage |
|---------------|-------|
| `runtime.ai.text.generate` | Query rewriting, 标题生成 |
| `runtime.ai.text.stream` | RAG 流式回答 |
| `runtime.ai.embedding.generate` | Chunk + query embedding |
| `data.register.*` / `data.query.*` | 8 组数据 API（参考 `tables/capabilities.yaml`） |
| `runtime.route.list.options` | 路由可用性查询 |
| `ui.register.ui-extension.app.sidebar.mods` | 侧边栏入口 |
| `ui.register.ui-extension.app.content.routes` | 内容路由 |
