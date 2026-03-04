# Frontend

> Domain: Meeting Scribe / Frontend
> Covers: 组件树、状态管理、UI 布局

## 0. Normative Imports

| Kernel Location | Rule IDs |
|---|---|
| `kernel/entity-contract.md` | MS-ENT-001, MS-ENT-002, MS-ENT-003, MS-ENT-004 |
| `kernel/pipeline-contract.md` | MS-PIPE-001, MS-PIPE-002 |
| `kernel/routing-contract.md` | MS-ROUTE-001, MS-ROUTE-002 |
| `kernel/tables/meeting-states.yaml` | 全部状态 |

## 1. Scope

本文档描述 Meeting Scribe 的前端组件架构、状态管理和最小 UI 布局。

## 2. UI 扩展注册

Meeting Scribe 注册两个 UI 扩展 slot：

| Slot | 用途 |
|------|------|
| `ui-extension.app.sidebar.mods` | 侧边栏"会议助手"入口 |
| `ui-extension.app.content.routes` | 内容区路由（上传页 / 结果页） |

## 3. 页面结构

### 3.1 路由

| Route | 页面 | 说明 |
|-------|------|------|
| `/meeting-scribe` | UploadPage | 默认页面，音频上传 + local-only 开关 |
| `/meeting-scribe/result` | ResultPage | 转录结果 + 摘要展示 |

### 3.2 UploadPage 布局

```
┌──────────────────────────────────────┐
│  Meeting Scribe                      │
├──────────────────────────────────────┤
│                                      │
│  ┌────────────────────────────────┐  │
│  │                                │  │
│  │     拖拽音频文件到此处          │  │
│  │     或点击选择文件              │  │
│  │                                │  │
│  │     支持 WAV/MP3/M4A/WebM/OGG │  │
│  │     最大 100MB                 │  │
│  │                                │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌──────────────────┐                │
│  │ 🔒 Local Only    │  ← toggle     │
│  └──────────────────┘                │
│  仅使用本地模型，数据不出本机         │
│                                      │
├──────────────────────────────────────┤
│  [处理状态区 - 条件渲染]             │
│                                      │
│  ● 上传中... (文件名, 大小)          │
│  ● 转录中... (进度条)                │
│  ● 分析中... (加载动画)              │
│                                      │
│  [错误时显示错误信息 + 重试按钮]     │
└──────────────────────────────────────┘
```

### 3.3 ResultPage 布局

```
┌──────────────────────────────────────┐
│  Meeting Scribe  [← 返回] [新会议]  │
├──────────────────────────────────────┤
│  会议标题 (可编辑)                    │
│  🔒 Local Only │ 时长 12:34 │ 中文   │
├───────────┬──────────────────────────┤
│           │                          │
│  Tab 切换  │  内容区                  │
│           │                          │
│  📝 转录   │  [转录文本 - 带时间戳    │
│  📋 摘要   │   和说话人标签]          │
│  ✅ 待办   │                          │
│           │  [Speaker 1] 00:00:12    │
│           │  我们今天讨论一下...       │
│           │                          │
│           │  [Speaker 2] 00:00:45    │
│           │  好的，关于上次的...       │
│           │                          │
├───────────┴──────────────────────────┤
│  说话人映射 (可折叠)                  │
│  Speaker 1: [输入真实姓名]           │
│  Speaker 2: [输入真实姓名]           │
└──────────────────────────────────────┘
```

**摘要 Tab:**
```
┌──────────────────────────────────────┐
│  📋 摘要                             │
├──────────────────────────────────────┤
│  核心要点                            │
│  • 讨论了Q2产品路线图                │
│  • 确定了新功能的优先级              │
│  • ...                               │
├──────────────────────────────────────┤
│  决议                                │
│  • 下周一启动新功能开发              │
│  • 预算增加20%                       │
└──────────────────────────────────────┘
```

**待办 Tab:**
```
┌──────────────────────────────────────┐
│  ✅ 待办事项                         │
├──────────────────────────────────────┤
│  🔴 High │ 完成设计稿               │
│           │ 负责人: 张三              │
│           │ 截止: 2026-03-10         │
├──────────────────────────────────────┤
│  🟡 Med  │ 调研竞品方案              │
│           │ 负责人: 李四              │
│           │ 截止: -                   │
├──────────────────────────────────────┤
│  🟢 Low  │ 更新文档                  │
│           │ 负责人: -                 │
│           │ 截止: -                   │
└──────────────────────────────────────┘
```

## 4. 组件树

```
MeetingScribeMod (root)
├── SidebarEntry                    → ui-extension.app.sidebar.mods
└── ContentRoutes                   → ui-extension.app.content.routes
    ├── UploadPage
    │   ├── AudioDropZone           → 拖拽 + 文件选择
    │   ├── LocalOnlyToggle         → local-only 开关
    │   ├── ProcessingStatus        → 上传/转录/分析进度
    │   └── ErrorDisplay            → 错误信息 + 重试按钮
    └── ResultPage
        ├── MeetingHeader           → 标题 + 元信息 + 导航
        ├── TabNavigation           → 转录 / 摘要 / 待办 tab 切换
        ├── TranscriptView          → 带时间戳和说话人的转录文本
        │   └── TranscriptSegment   → 单条转录片段
        ├── SummaryView             → 要点 + 决议
        ├── ActionItemsView         → 待办事项列表
        │   └── ActionItemCard      → 单条待办卡片
        └── SpeakerMapEditor        → 说话人映射编辑
```

## 5. 状态管理

Phase 1 使用 React state（useState / useReducer）管理全部状态：

```typescript
interface MeetingScribeState {
  // Current meeting
  meeting: Meeting | null;

  // UI state
  activeTab: 'transcript' | 'summary' | 'actions';
  speakerMap: Record<string, string>; // Speaker 1 → 张三

  // Processing state
  processingStep: 'idle' | 'uploading' | 'transcribing' | 'analyzing';
  progress: number; // 0.0 ~ 1.0
  error: { code: string; message: string } | null;
}
```

状态流转严格遵循 `tables/meeting-states.yaml` 的状态机定义。

## 6. 交互规则

- 文件上传后自动开始处理，无需额外确认按钮。
- 处理过程中显示进度，不可上传新文件（disable drop zone）。
- 处理完成后自动跳转到 ResultPage。
- 错误时显示错误信息和对应的恢复操作按钮。
- Local-only 开关在处理过程中不可切换。
- 说话人映射编辑实时生效，同步更新转录视图和待办中的 assignee。
