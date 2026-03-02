# Frontend Architecture

> Domain: Audio Book / Frontend
> Covers: Component structure, state management, routing, UI per step

## 0. Normative Imports

| Kernel Location | Rule IDs |
|---|---|
| `kernel/entity-contract.md` | VS-ENT-001 ~ 009 |
| `kernel/pipeline-contract.md` | VS-PIPE-001 ~ 007 |
| `kernel/synthesis-contract.md` | VS-SYNTH-006 |

## 1. Scope

本文档定义 Audio Book 在 desktop 中的前端架构：组件树、状态管理、Step 间导航、每个 Step 的 UI 结构。

遵循 nimi-mod 前端惯例：Controller Hook 编排 + Zustand 持久状态 + React Hooks 临时状态 + Panel Builder 条件渲染。

## 2. Mod 注册

### 2.1 入口文件

```
audio-book/
├── index.ts                  # re-export createRuntimeMod
└── src/
    ├── index.ts              # validate manifest, export factory
    ├── runtime-mod.ts        # createAudioBookRuntimeMod()
    └── contracts.ts          # MOD_ID, capabilities, slots, tab IDs
```

### 2.2 注册 (runtime-mod.ts setup)

```typescript
// 1. 创建 clients
const hookClient = createHookClient(MOD_ID, sdkRuntimeContext);
const aiClient = createAiClient(MOD_ID, sdkRuntimeContext);

// 2. 注册 sidebar nav
await hookClient.ui.register({
  slot: 'ui-extension.app.sidebar.mods',
  priority: 150,
  extension: {
    type: 'nav-item',
    tabId: 'audio-book',
    label: t('page.title', 'Audio Book'),
    icon: 'microphone',
    strategy: 'append',
  },
});

// 3. 注册 content route (lazy load)
const LazyPage = React.lazy(() => import('./audio-book-page.js'));
await hookClient.ui.register({
  slot: 'ui-extension.app.content.routes',
  priority: 150,
  extension: {
    type: 'tab-page',
    tabId: 'audio-book',
    component: () => React.createElement(
      Suspense,
      { fallback: loadingUI },
      React.createElement(LazyPage),
    ),
  },
});

// 4. 注册 data capabilities (项目 CRUD)
await registerAudioBookDataCapabilities({ hookClient });
```

## 3. 组件树

```
<AudioBookPage>                          ← 顶层页面入口
  └─ useAudioBookPageController()        ← Controller Hook（编排全部逻辑）
      ├─ useAudioBookStore()             ← Zustand 持久状态
      ├─ useAudioBookUiState()           ← React 临时 UI 状态
      ├─ useAudioBookClients()           ← hookClient + aiClient
      └─ renders:
          <AudioBookShell>               ← 外壳布局
            ├─ <ProjectHeader />           ← 项目名 + 步骤导航条
            ├─ <StepContent />             ← 按当前 step 条件渲染：
            │   ├─ step=import   → <ImportStep />
            │   ├─ step=analyze  → <AnalyzeStep />
            │   ├─ step=cast     → <CastStep />
            │   ├─ step=synth    → <SynthesisStep />
            │   └─ step=play     → <PlaybackStep />
            └─ <StepFooter />              ← 上一步/下一步按钮
```

## 4. 状态管理

### 4.1 三层状态

| 层 | 工具 | 内容 | 生命周期 |
|---|---|---|---|
| **持久状态** | Zustand + IndexedDB | 项目列表、Script、CharacterProfile、VoiceCasting、SynthesisJob 元数据 | 跨会话持久 |
| **临时 UI 状态** | React useState/useReducer | 当前 step、loading 状态、modal 开关、选中角色、播放位置 | 页面级 |
| **全局 App 状态** | useAppStore | 当前用户、activeTab、导航 | desktop 全局 |

### 4.2 Zustand Store 设计

```typescript
interface AudioBookStore {
  // ---- 项目列表 ----
  projects: VoiceProjectMeta[];          // 轻量元数据列表（不含 chapters 原文）
  activeProjectId: string | null;

  // ---- 当前活跃项目的完整数据 ----
  project: VoiceProject | null;          // 包含 sourceChapters
  script: Script | null;
  characters: CharacterProfile[];
  synthesisJob: SynthesisJob | null;

  // ---- Actions ----
  loadProjectList: () => Promise<void>;
  openProject: (id: string) => Promise<void>;
  createProject: (name: string) => Promise<string>;
  deleteProject: (id: string) => Promise<void>;

  updateProject: (patch: Partial<VoiceProject>) => void;
  setScript: (script: Script) => void;
  setCharacters: (characters: CharacterProfile[]) => void;
  updateCharacter: (name: string, patch: Partial<CharacterProfile>) => void;
  mergeCharacters: (keepName: string, mergeName: string) => void;
  setSynthesisJob: (job: SynthesisJob) => void;
  updateSegmentJob: (segmentId: string, patch: Partial<SegmentJob>) => void;
}
```

### 4.3 IndexedDB 层

Store actions 内部调用 IndexedDB wrapper：

```typescript
// DB: 'audio-book', version: 1
// Object Stores:
//   'projects'     → key: projectId, value: VoiceProject JSON
//   'scripts'      → key: projectId, value: Script JSON
//   'characters'   → key: projectId, value: CharacterProfile[] JSON
//   'jobs'         → key: projectId, value: SynthesisJob JSON
//   'audio'        → key: '{projectId}:{segmentId}', value: Blob (mp3)
```

Zustand store 在 `openProject()` 时从 IndexedDB 加载，在每次 mutation 后自动写回。音频 Blob 不进 Zustand store（太大），播放时直接从 IndexedDB 按需读取。

### 4.4 临时 UI 状态

```typescript
function useAudioBookUiState() {
  // 步骤导航
  const [currentStep, setCurrentStep] = useState<Step>('import');

  // Import step
  const [importText, setImportText] = useState('');
  const [importLoading, setImportLoading] = useState(false);

  // Analyze step
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null);

  // Cast step
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);

  // Synthesis step
  const [synthProgress, setSynthProgress] = useState<SynthProgress | null>(null);

  // Playback step
  const [playbackState, setPlaybackState] = useState<PlaybackState>({
    isPlaying: false,
    currentChapterIndex: 0,
    currentSegmentIndex: 0,
    positionMs: 0,
  });

  // 通用
  const [error, setError] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog | null>(null);

  return { currentStep, setCurrentStep, /* ...all above */ };
}
```

## 5. Controller Hook

```typescript
function useAudioBookPageController() {
  // 1. Clients
  const { hookClient, aiClient } = useAudioBookClients();

  // 2. App state
  const currentUser = useAppStore((s) => s.auth?.user || null);

  // 3. Persistent state
  const store = useAudioBookStore();

  // 4. UI state
  const ui = useAudioBookUiState();

  // 5. 派生状态
  const derived = useMemo(() => ({
    canAdvance: computeCanAdvance(ui.currentStep, store),
    canRetreat: computeCanRetreat(ui.currentStep),
    stepProgress: computeStepProgress(store),
  }), [ui.currentStep, store]);

  // 6. Actions (step-specific)
  const importActions = useImportActions(store, ui, hookClient);
  const analyzeActions = useAnalyzeActions(store, ui, aiClient);
  const castActions = useCastActions(store, ui, hookClient, aiClient);
  const synthActions = useSynthActions(store, ui, hookClient);
  const playbackActions = usePlaybackActions(store, ui);

  // 7. Step 导航
  const navigation = useStepNavigation(store, ui);

  return {
    store, ui, derived,
    importActions, analyzeActions, castActions, synthActions, playbackActions,
    navigation,
  };
}
```

## 6. 各 Step UI 设计

### 6.1 项目列表（首页）

当 `activeProjectId = null` 时显示项目列表而非 step 内容：

```
┌─────────────────────────────────────────┐
│ Audio Book                   [+ 新建]  │
│                                         │
│  项目列表:                               │
│  ┌─────────────────────────────────┐    │
│  │ 📖 《三体》    ● 合成中 60%     │    │
│  │ 📖 《围城》    ✓ 已完成         │    │
│  │ 📖 《活着》    ○ 待分配声线     │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

**组件**: `<ProjectListView />`
- 每个项目卡片显示：名称、状态、章节数、角色数、创建时间
- 点击项目 → `store.openProject(id)` → 进入对应 step
- 右键/长按 → 删除确认

### 6.2 Step 1 — ImportStep

```
┌─────────────────────────────────────────────────┐
│  [1·导入] → 2·分析 → 3·声线 → 4·合成 → 5·播放  │
├─────────────────────────────────────────────────┤
│                                                 │
│  项目名称: [《三体》________________]            │
│                                                 │
│  ┌───────────────────────────────────────┐      │
│  │   拖拽 .txt 文件到此处                 │      │
│  │   或 点击上传                          │      │
│  └───────────────────────────────────────┘      │
│                                                 │
│  ┌───────────────────────────────────────┐      │
│  │ (文本预览 / 粘贴区)                    │      │
│  │ 第一章 科学边界                        │      │
│  │ 汪淼骑着自行车来到...                  │      │
│  └───────────────────────────────────────┘      │
│                                                 │
│  ✓ 检测到 24 个章节，共 18.6 万字                │
│                                                 │
├─────────────────────────────────────────────────┤
│                              [下一步：分析 →]    │
└─────────────────────────────────────────────────┘
```

**组件分解**:
```
<ImportStep>
  ├─ <ProjectNameInput />
  ├─ <FileDropZone />            ← <input type="file"> + drag & drop
  ├─ <TextPreview />             ← 显示已导入文本（按章节折叠）
  └─ <ImportStats />             ← 章节数、字数统计
```

### 6.3 Step 2 — AnalyzeStep

```
┌─────────────────────────────────────────────────┐
│  1·导入 → [2·分析] → 3·声线 → 4·合成 → 5·播放  │
├─────────────────────────────────────────────────┤
│                                                 │
│  ⏳ 正在分析第 3 / 24 章...                      │
│  ████████░░░░░░░░  33%                          │
│                                                 │
│  已识别角色:                                     │
│  ┌───────────────────────────────────────┐      │
│  │ 叶文洁 (42段) · 汪淼 (67段) · 史强    │      │
│  │ (55段) · 杨冬 (12段) · +3 more        │      │
│  └───────────────────────────────────────┘      │
│                                                 │
│  实时预览:                                       │
│  ┌───────────────────────────────────────┐      │
│  │ [旁白] 汪淼骑着自行车来到射击场...     │      │
│  │ [史强] "汪教授，我姓史，大史。"        │      │
│  │ [汪淼] "史队长，你找我什么事？"        │      │
│  └───────────────────────────────────────┘      │
│                                                 │
├─────────────────────────────────────────────────┤
│  [取消]                       [下一步：声线 →]   │
└─────────────────────────────────────────────────┘
```

**组件分解**:
```
<AnalyzeStep>
  ├─ <AnalysisProgressBar />     ← 总进度 + 当前章节
  ├─ <CharacterChipList />       ← 已识别角色的 chip 列表
  ├─ <SegmentPreviewList />      ← 最近生成的 segments 实时滚动
  └─ <AnalysisControls />        ← 取消/暂停按钮
```

**状态流**:
- `analyzeActions.startAnalysis()` → 逐章调用 `aiClient.generateObject()`
- 每章完成 → 更新 `store.script` + `store.characters` + `ui.analysisProgress`
- 分析完成 → `store.updateProject({ status: 'analyzed' })`

### 6.4 Step 3 — CastStep

```
┌──────────────────────────────────────────────────────────┐
│  1·导入 → 2·分析 → [3·声线] → 4·合成 → 5·播放           │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  角色列表               │  选中角色详情                    │
│  ┌─────────────────┐   │  ┌───────────────────────────┐  │
│  │ ✓ 旁白     380段│   │  │ 角色：史强                 │  │
│  │ ✓ 叶文洁    42段│   │  │ 性别：男 / 年龄：中年      │  │
│  │ ● 史强      55段│   │  │ 特征：粗犷、直爽、豪放     │  │
│  │ ○ 汪淼      67段│   │  │                           │  │
│  │ ○ 杨冬      12段│   │  │ 声线:                     │  │
│  │ ◌ 路人甲     2段│   │  │ Provider: [DashScope ▼]   │  │
│  └─────────────────┘   │  │ Voice:    [Ethan    ▼]    │  │
│                        │  │ 语速: ──●────── 1.0x      │  │
│  [一键推荐全部声线]      │  │ 音调: ────●──── 0         │  │
│  [低频角色用默认]        │  │ 情绪: [沉稳 ▼]           │  │
│                        │  │                           │  │
│                        │  │ 试听: "有人要杀你。"       │  │
│                        │  │ [▶ 播放] [🔄 换一句]      │  │
│                        │  └───────────────────────────┘  │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  [← 重新分析]                     [下一步：合成 →]        │
└──────────────────────────────────────────────────────────┘
```

**组件分解**:
```
<CastStep>
  ├─ <CharacterList>                 ← 左侧角色列表
  │   ├─ <CharacterListItem />       ← 单个角色行（名称、段数、状态）
  │   └─ <CharacterBatchActions />   ← 一键推荐、低频默认按钮
  └─ <CharacterDetail>               ← 右侧详情面板
      ├─ <CharacterInfo />           ← 性别、年龄、traits 展示/编辑
      ├─ <VoiceSelector />           ← Provider + Voice 下拉 + 参数滑条
      └─ <VoicePreview />            ← 试听台词 + 播放按钮
```

**关键交互**:
- 选择角色 → `ui.setSelectedCharacter(name)`
- 切换 voice → `store.updateCharacter(name, { voiceCasting: { ... } })`
- 试听 → `castActions.preview(characterName)` → 调 `hookClient.llm.speech.synthesize()`
- 一键推荐 → `castActions.autoRecommendAll()` → 调 `aiClient.generateObject()` 返回推荐映射

### 6.5 Step 4 — SynthesisStep

```
┌──────────────────────────────────────────────────────────┐
│  1·导入 → 2·分析 → 3·声线 → [4·合成] → 5·播放           │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  总进度: ████████████░░░░░░░░  58%  1,247 / 2,148 段    │
│  预计剩余: ~23 分钟                                       │
│                                                          │
│  章节进度:                                                │
│  ┌─────────────────────────────────────────────────┐     │
│  │ ✓ 第 1 章 - 科学边界                    100%    │     │
│  │ ✓ 第 2 章 - 台球                        100%    │     │
│  │ ...                                              │     │
│  │ ● 第 14 章 - 红岸基地       ██████░░░   62%     │     │
│  │ ○ 第 15 章 - 三体问题                   0%      │     │
│  └─────────────────────────────────────────────────┘     │
│                                                          │
│  ⚠ 3 个段落合成失败 [查看详情] [重试失败项]               │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  [← 修改声线]  [暂停]          [去播放已完成章节 →]       │
└──────────────────────────────────────────────────────────┘
```

**组件分解**:
```
<SynthesisStep>
  ├─ <SynthProgressSummary />        ← 总进度条 + 统计
  ├─ <ChapterProgressList>           ← 章节级进度列表
  │   └─ <ChapterProgressItem />     ← 单章进度条
  ├─ <FailedSegmentsBanner />        ← 失败段落提示 + 操作
  └─ <SynthControls />               ← 暂停/恢复/取消
```

**状态流**:
- `synthActions.start()` → 创建 SynthesisJob → 启动调度循环
- 调度循环在 `useEffect` 中运行，用 `useRef` 持有 queue state
- 每完成一个 segment → `store.updateSegmentJob()` + `ui.setSynthProgress()`
- 音频 Blob 直接写 IndexedDB，不经过 Zustand

### 6.6 Step 5 — PlaybackStep

```
┌──────────────────────────────────────────────────────────┐
│  1·导入 → 2·分析 → 3·声线 → 4·合成 → [5·播放]           │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  第 1 章 - 科学边界                    [章节列表 ▼]       │
│                                                          │
│  ┌─ 文本跟读区 ──────────────────────────────────┐       │
│  │                                                │       │
│  │  汪淼骑着自行车来到射击场，远远看见一群人       │       │
│  │  站在靶场边上。                                 │       │
│  │                                                │       │
│  │  ┌─ 史强 ──────────────────────────────┐      │       │
│  │  │ "汪教授，我姓史，大史。"             │ ← now │       │
│  │  └─────────────────────────────────────┘      │       │
│  │                                                │       │
│  │  汪淼打量了一下眼前这个壮实的男人。            │       │
│  │                                                │       │
│  └────────────────────────────────────────────────┘       │
│                                                          │
│  ◁◁   ▶   ▷▷       ──────●──────── 03:24 / 38:12       │
│  ■ 旁白  ■ 史强  ■ 汪淼                                  │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  [← 修改声线]         [导出本章音频 ↓]                    │
└──────────────────────────────────────────────────────────┘
```

**组件分解**:
```
<PlaybackStep>
  ├─ <ChapterSelector />             ← 章节切换下拉
  ├─ <TextFollowPanel>               ← 文本跟读主区域
  │   └─ <SegmentTextBlock />        ← 单个段落（角色标签 + 文本 + 高亮）
  ├─ <PlaybackControls />            ← 播放/暂停/前进/后退 + 进度条
  ├─ <CharacterColorLegend />        ← 角色颜色图例
  └─ <ExportButton />                ← 可选导出
```

**播放引擎 hook**:
```typescript
function usePlaybackEngine(store: AudioBookStore) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const nextBlobUrlRef = useRef<string | null>(null);  // 预加载

  const play = useCallback(async (chapterIndex: number, segmentIndex: number) => {
    const segment = getSegment(store.script, chapterIndex, segmentIndex);
    const blob = await readAudioBlob(store.project.id, segment.id);
    const url = URL.createObjectURL(blob);
    audioRef.current = new Audio(url);
    audioRef.current.onended = () => {
      URL.revokeObjectURL(url);
      advanceToNext();  // 播放下一段
    };
    audioRef.current.play();
    preloadNext(chapterIndex, segmentIndex + 1);  // 预加载
  }, [store]);

  return { play, pause, resume, seekTo, playbackState };
}
```

## 7. Step 导航

### 7.1 步骤条 (StepIndicator)

页面顶部常驻 5 步导航条，显示：
- 当前步骤高亮
- 已完成步骤带 ✓
- 可点击已完成的步骤直接跳转（触发回退逻辑）
- 未到达的步骤灰色不可点击

### 7.2 前进/后退规则

```typescript
type Step = 'import' | 'analyze' | 'cast' | 'synth' | 'play';

function computeCanAdvance(step: Step, store: AudioBookStore): boolean {
  switch (step) {
    case 'import':  return store.project?.sourceChapters.length > 0;
    case 'analyze': return store.project?.status === 'analyzed';
    case 'cast':    return allRequiredVoicesAssigned(store.characters);
    case 'synth':   return hasAtLeastOneChapterDone(store.synthesisJob);
    case 'play':    return false; // 最后一步
  }
}

function computeCanRetreat(step: Step): boolean {
  return step !== 'import'; // 第一步不能后退
}
```

### 7.3 回退确认

从 Step 3/4/5 回退到 Step 2（重新分析）时，弹出确认对话框：

> "重新分析将清空当前的脚本、角色和声线分配。已合成的音频也将被删除。确认继续？"

回退操作对应 `project-states.yaml` 中定义的 `side_effects`。

## 8. 文件结构

```
audio-book/src/
├── index.ts
├── runtime-mod.ts
├── contracts.ts                          # MOD_ID, capabilities, slots
├── manifest.ts                           # MANIFEST object
├── audio-book-page.tsx                 # 顶层页面入口
│
├── controllers/
│   ├── audio-book-page-controller.ts   # 主 Controller Hook
│   └── use-audio-book-ui-state.ts      # 临时 UI 状态
│
├── state/
│   ├── audio-book-store.ts             # Zustand store
│   └── indexed-db.ts                     # IndexedDB wrapper
│
├── hooks/
│   ├── use-import-actions.ts             # Step 1 业务逻辑
│   ├── use-analyze-actions.ts            # Step 2 业务逻辑
│   ├── use-cast-actions.ts               # Step 3 业务逻辑
│   ├── use-synth-actions.ts              # Step 4 业务逻辑（含调度引擎）
│   ├── use-playback-actions.ts           # Step 5 业务逻辑
│   ├── use-playback-engine.ts            # 播放引擎 (Audio API)
│   └── use-step-navigation.ts            # Step 间导航逻辑
│
├── components/
│   ├── shell/
│   │   ├── audio-book-shell.tsx        # 外壳布局
│   │   ├── step-indicator.tsx            # 步骤导航条
│   │   └── step-footer.tsx              # 上/下一步按钮
│   ├── project/
│   │   └── project-list-view.tsx         # 项目列表首页
│   ├── import/
│   │   ├── import-step.tsx
│   │   ├── file-drop-zone.tsx
│   │   └── text-preview.tsx
│   ├── analyze/
│   │   ├── analyze-step.tsx
│   │   ├── analysis-progress-bar.tsx
│   │   ├── character-chip-list.tsx
│   │   └── segment-preview-list.tsx
│   ├── cast/
│   │   ├── cast-step.tsx
│   │   ├── character-list.tsx
│   │   ├── character-detail.tsx
│   │   ├── voice-selector.tsx
│   │   └── voice-preview.tsx
│   ├── synth/
│   │   ├── synthesis-step.tsx
│   │   ├── synth-progress-summary.tsx
│   │   └── chapter-progress-list.tsx
│   └── playback/
│       ├── playback-step.tsx
│       ├── text-follow-panel.tsx
│       ├── segment-text-block.tsx
│       ├── playback-controls.tsx
│       └── character-color-legend.tsx
│
├── services/
│   ├── chapter-splitter.ts               # 章节拆分纯逻辑
│   ├── analysis-pipeline.ts              # LLM 分析编排
│   ├── voice-recommender.ts              # 声线推荐逻辑
│   ├── synthesis-scheduler.ts            # 合成队列调度器
│   └── audio-exporter.ts                 # Web Audio 导出（可选）
│
├── data/
│   └── audio-book-data-registrar.ts    # Data capability 注册
│
├── locales/
│   ├── en.ts
│   └── zh.ts
│
└── types.ts                              # 内部类型定义
```

## 9. 测试适配策略

### 9.1 Layer 2 (脱离 desktop 的集成测试)

`services/` 目录下的纯逻辑模块是 Layer 2 测试的主要对象：

| Service | 测试方式 | 依赖 |
|---------|---------|------|
| `chapter-splitter.ts` | 纯函数，直接 vitest | 无 |
| `analysis-pipeline.ts` | 调用真实 LLM API | runtime gRPC / HTTP |
| `voice-recommender.ts` | 调用 LLM + listVoices | runtime gRPC / HTTP |
| `synthesis-scheduler.ts` | 调用真实 TTS API | runtime gRPC / HTTP |

测试脚本直接 import 这些 service 模块，用 runtime API client 替代 hookClient：

```typescript
// test/scripts/step2-analyze.ts
import { AnalysisPipeline } from '../../src/services/analysis-pipeline.js';

// 测试时注入 runtime client（非 hookClient）
const pipeline = new AnalysisPipeline({ llmClient: runtimeDirectClient });
const result = await pipeline.analyzeChapter(chapterText, existingCharacters);
```

### 9.2 Hook 适配层

`services/` 模块接受一个抽象的 client 接口，不直接依赖 hookClient：

```typescript
// services/analysis-pipeline.ts
interface LlmClient {
  generateObject<T>(params: GenerateObjectParams<T>): Promise<T>;
}

// 在 desktop 中: hookClient adapter
// 在测试中:     runtime direct client
```

这样同一套 service 代码在两个环境都能跑，集成到 desktop 时只需要写一个薄的 adapter 层。

## 10. Desktop 集成清单

最终集成到 desktop 时需要做的事：

| # | 工作 | 说明 |
|---|------|------|
| 1 | hookClient adapter | 将 `LlmClient` / `TtsClient` 接口适配到 `hookClient.llm.*` |
| 2 | UI 注册 | `runtime-mod.ts` 中的 sidebar + route 注册 |
| 3 | Data capabilities | 注册 `data-api.audio-book.*` 供其他 mod 查询 |
| 4 | i18n | 注册翻译文件 |
| 5 | 权限声明 | `mod.manifest.yaml` capabilities 列表 |
| 6 | 构建配置 | `tsconfig.build.json` + 打包到 `dist/mods/audio-book/index.js` |
