# Knowledge Base — Frontend Architecture

> Thin domain document. References kernel Rule IDs for business logic.

## Normative Imports

| Document | Rule IDs | Relevance |
|----------|----------|-----------|
| `kernel/domain-contract.md` | KB-DOM-001~007 | Entity shapes rendered in UI |
| `kernel/pipeline-contract.md` | KB-PIPE-001 | Document status displayed in cards |
| `kernel/rag-contract.md` | KB-RAG-001~005 | Chat message flow, citations |
| `kernel/capability-contract.md` | KB-CAP-001 | Mod registration, nav entry |

## Component Tree

```
KnowledgeBasePage
├── KBShell (layout + toast error + confirm dialog)
│   ├── header: KBNavTabs (Documents | Chat | Settings)
│   └── content:
│       ├── [documents] DocumentListPage
│       │   ├── Header (title + search + import button)
│       │   ├── DocumentCard[] (icon + status + progress + menu)
│       │   │   └── DocumentStatusBadge → StatusBadge (ui/badge)
│       │   ├── EmptyState (icon + CTA)
│       │   └── ImportDialog (File | Text | URL tabs + drag-drop)
│       │
│       ├── [chat] ChatPage
│       │   ├── ConversationSidebar (search + list + rename + delete)
│       │   └── Main Area
│       │       ├── RouteBanner (collapsible, RouteChip pills)
│       │       ├── ScopeSelector (document filter pills)
│       │       ├── MessageList
│       │       │   └── MessageBubble[] (user=indigo / assistant=white+shadow)
│       │       │       └── CitationInline ([N] chips)
│       │       ├── CitationPanel (detail view, Escape to close)
│       │       └── ChatInput (textarea + send button)
│       │
│       └── [settings] SettingsPage
│           ├── Card: Chunking (chunkSize + chunkOverlap)
│           ├── Card: Retrieval (topK + threshold + maxContextChunks)
│           ├── Card: Query Rewriting (toggle switch)
│           └── Card: Runtime Route (Chat + Embedding RoutePanel)
```

## State Management

### Persistent State (Zustand → IndexedDB)

`useKnowledgeBaseStore` — 全局状态，`init()` 时从 IndexedDB 加载：

- `documents: KBDocument[]` — 按 updatedAt 降序（KB-DOM-001）
- `chunkMap: Map<string, KBChunk>` — 内存 fast lookup（KB-DOM-002）
- `vectorStore: VectorStore` — in-memory 向量索引（KB-PIPE-005）
- `conversations: KBConversation[]` — 按 updatedAt 降序（KB-DOM-004）
- `activeConversation: KBConversation | null` — 当前对话（含完整 turns）
- `settings: KBSettings` — 持久化设置（KB-DOM-007）

### UI State (React hooks, ephemeral)

`useKBUiState` — 临时 UI 状态：

- `error` / `isImporting` / `isSending` / `streamingText`
- `importDialogOpen` / `citationPanelChunkId` / `confirmDialog`

### Routing State

- `activeTab: 'documents' | 'chat' | 'settings'` — tab 切换，存于 Zustand（不持久化）

## Adapter Layer

| Adapter | SDK Interface | Service Interface |
|---------|--------------|-------------------|
| `llm-adapter.ts` | `ModRuntimeClient` | `LlmClient { generateText, streamText }` |
| `embedding-adapter.ts` | `ModRuntimeClient` | `EmbeddingClient { generateEmbedding }` |

路由解析在 `use-kb-clients.ts`：

- 按 capability 调 `runtime.route.listOptions()`
- 根据 `KBSettings.*RouteSource` 选择 cloud / local / auto
- Auto 模式 embedding adapter 实现 cloud → local 回退（KB-CAP-002）

## Service Layer

| Service | File | Kernel Reference |
|---------|------|-----------------|
| Document Parser | `document-parser.ts` | KB-PIPE-002 |
| Chunker | `chunker.ts` | KB-PIPE-003 |
| Document Pipeline | `document-pipeline.ts` | KB-PIPE-001 |
| Embedding Pipeline | `embedding-pipeline.ts` | KB-PIPE-004 |
| Vector Store | `vector-store.ts` | KB-PIPE-005 |
| Query Rewriter | `query-rewriter.ts` | KB-RAG-002 |
| RAG Pipeline | `rag-pipeline.ts` | KB-RAG-001, 003, 004 |
| Citation Parser | `citation-parser.ts` | KB-RAG-005 |

Constants:
- `BATCH_SIZE = 32` (embedding-pipeline.ts)
- `estimateTokens = Math.ceil(text.length / 4)` (chunker.ts)
- `MAX_HISTORY_TURNS = 5` (query-rewriter.ts, context window)
- `CONTEXT_TURNS = 3` (rag-pipeline.ts, prompt history)
- `ROUTE_POLL_INTERVAL = 15000ms` (use-kb-clients.ts)

## UI Design Patterns

### Color System
- Primary: `indigo-600` (#4F46E5)
- Success: `green-600`
- Error: `red-500`
- Background: `white` + `gray-50`
- Border: `gray-200`
- Text: `gray-900` (title) / `gray-700` (body) / `gray-500` (secondary) / `gray-400` (muted)

### Shared UI Components (`components/ui/`)
- `Button` — variants: primary (indigo-600), secondary, destructive, ghost; sizes: sm, md
- `Badge` + `StatusBadge` — document status indicators with icons
- `Dialog` + `ConfirmDialog` — Radix Dialog for import and delete confirmation
- `Progress` — Radix Progress bar for embedding progress
- `Tooltip` — Radix Tooltip with 300ms delay

### Interaction Patterns
- **Document search**: header search box filters by title/tags (DocumentListPage)
- **Conversation search**: sidebar search box filters by title (ConversationSidebar)
- **Conversation rename**: double-click title or pencil icon → inline edit (Enter/Escape)
- **Delete confirmation**: ConfirmDialog via `ui.setConfirmDialog()` (documents + conversations)
- **Citation panel**: Escape key to close; click `[N]` inline chip to open
- **Route banner**: collapsible (default collapsed) showing RouteChip pills
- **Import dialog**: 3 tabs (File/Text/URL) + drag-drop zone for files
- **Auto-scroll**: message list scrolls to bottom on new turns/streaming

## File Structure

```
src/components/
├── shared/
│   ├── kb-shell.tsx              # Layout shell + toast + confirm dialog
│   └── kb-nav-tabs.tsx           # Tab navigation with icons + counts
├── documents/
│   ├── document-list-page.tsx    # Search + list + empty state + import
│   ├── document-card.tsx         # Card with icon + status + progress + menu
│   ├── document-status-badge.tsx # Re-exports StatusBadge
│   └── import-dialog.tsx         # Radix Dialog with 3-tab import
├── chat/
│   ├── chat-page.tsx             # Main layout + route banner + empty states
│   ├── conversation-sidebar.tsx  # Search + list + rename + delete
│   ├── message-list.tsx          # Scrollable turn list
│   ├── message-bubble.tsx        # User (indigo) / assistant (white) bubbles
│   ├── chat-input.tsx            # Textarea + send button
│   ├── citation-panel.tsx        # Expandable citation detail (Escape to close)
│   ├── citation-inline.tsx       # [N] chip in assistant messages
│   └── scope-selector.tsx        # Document scope filter pills
├── settings/
│   └── settings-page.tsx         # 4 card groups (Chunking, Retrieval, QR, Route)
└── ui/
    ├── button.tsx                # Radix-less, Tailwind variants
    ├── badge.tsx                 # StatusBadge with SVG icons
    ├── dialog.tsx                # Radix Dialog + ConfirmDialog
    ├── progress.tsx              # Radix Progress bar
    └── tooltip.tsx               # Radix Tooltip
```
