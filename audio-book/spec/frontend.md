# Frontend Architecture

> Domain: Audio Book / Frontend
> Covers: Component structure, state management, routing, UI per step

## 0. Normative Imports

| Kernel Location | Rule IDs |
|---|---|
| `kernel/entity-contract.md` | VS-ENT-001 ~ 009 |
| `kernel/pipeline-contract.md` | VS-PIPE-001 ~ 008 |
| `kernel/synthesis-contract.md` | VS-SYNTH-006 |

## 1. Scope

本文档定义 Audio Book 在 desktop 中的前端架构：组件树、状态管理、Step 间导航、每个 Step 的 UI 结构。

遵循 nimi-mod 前端惯例：Controller Hook 编排 + Zustand 持久状态 + React Hooks 临时状态。

## 2. Mod 注册

### 2.1 入口文件

```
audio-book/
├── index.ts                  # re-export createRuntimeMod
└── src/
    ├── index.ts              # validate manifest, export factory
    ├── runtime-mod.ts        # createAudioBookRuntimeMod()
    ├── contracts.ts          # MOD_ID, capabilities, slots, tab IDs, error codes
    └── manifest.ts           # MANIFEST object (ai.dependencies, hooks)
```

### 2.2 注册 (runtime-mod.ts setup)

```typescript
// 1. 创建 clients
const hookClient = createHookClient(MOD_ID, sdkRuntimeContext);
const aiClient = createAiClient(MOD_ID, sdkRuntimeContext);

// 2. 注册 sidebar nav
await hookClient.ui.register({
  slot: 'ui-extension.app.sidebar.mods',
  extension: { type: 'nav-item', tabId: 'audio-book', label: 'Audio Book', icon: 'microphone' },
});

// 3. 注册 content route (lazy load)
const LazyPage = React.lazy(() => import('./audio-book-page.js'));
await hookClient.ui.register({
  slot: 'ui-extension.app.content.routes',
  extension: { type: 'tab-page', tabId: 'audio-book', component: () => <Suspense><LazyPage /></Suspense> },
});
```

## 3. 组件树

```
<AudioBookPage>                          ← 顶层页面入口
  ├─ 无活跃项目时 → <ProjectListView />  ← 项目列表（含 create/delete 确认弹窗）
  └─ 有活跃项目时 →
      useAudioBookPageController()       ← 单一 Controller Hook（编排全部逻辑）
        ├─ useAudioBookStore()           ← Zustand 持久状态
        ├─ useAudioBookUiState()         ← React 临时 UI 状态
        ├─ useAudioBookClients()         ← hookClient + aiClient + llmClient + ttsClient
        ├─ useStepNavigation()           ← Step 导航逻辑
        ├─ useTtsRoute()                 ← TTS/Chat connector 发现与 model 选择
        └─ renders:
            <AudioBookShell>             ← 外壳布局（error toast + confirm dialog）
              ├─ <ProjectHeader />       ← 书本图标 + "AudioBook Studio" + <StepIndicator />
              ├─ <StepContent />         ← 按当前 step 条件渲染：
              │   ├─ step=import   → <ImportStep />
              │   ├─ step=analyze  → <AnalyzeStep />
              │   ├─ step=cast     → <CastStep />
              │   ├─ step=synth    → <SynthesisStep />
              │   └─ step=play     → <PlaybackStep />
              └─ <StepFooter />          ← 箭头图标 prev/next 按钮
```

## 4. 状态管理

### 4.1 三层状态

| 层 | 工具 | 内容 | 生命周期 |
|---|---|---|---|
| **持久状态** | Zustand + IndexedDB | 项目列表、Script、CharacterProfile[]、VoiceCasting[]、SynthesisJob | 跨会话持久 |
| **临时 UI 状态** | `useAudioBookUiState()` | 当前 step、loading、进度、选中角色、播放状态、testMode | 页面级 |
| **路由状态** | `useTtsRoute()` | connector 列表、chat/tts selection、model | 页面级，localStorage 持久化选择 |

### 4.2 临时 UI 状态 (`useAudioBookUiState`)

```typescript
type AudioBookStep = 'import' | 'analyze' | 'cast' | 'synth' | 'play';

// 返回的状态字段：
{
  currentStep / setCurrentStep         // AudioBookStep
  importText / setImportText           // string
  importLoading / setImportLoading     // boolean
  analysisProgress / setAnalysisProgress // AnalysisProgress | null
  analysisRunning / setAnalysisRunning // boolean
  selectedCharacter / setSelectedCharacter // string | null
  previewPlaying / setPreviewPlaying   // string | null
  synthProgress / setSynthProgress     // SynthProgress | null
  synthRunning / setSynthRunning       // boolean
  playbackState / setPlaybackState     // PlaybackState | null
  playbackSpeed / setPlaybackSpeed     // number (default 1.0)
  playbackChapter / setPlaybackChapter // number (default 0)
  error / setError / clearError        // string | null
  confirmDialog / setConfirmDialog     // { message, onConfirm } | null
  testMode / setTestMode               // boolean
  testSegmentIds / setTestSegmentIds   // string[]
  testSynthesisJob / setTestSynthesisJob // SynthesisJob | null
}
```

### 4.3 TTS Route 状态 (`useTtsRoute`)

```typescript
type TtsRouteState = {
  chatConnectors: RuntimeRouteConnectorOption[];
  ttsConnectors: RuntimeRouteConnectorOption[];
  chatSelection: RouteSelection;    // { connectorId, routeSource, model? }
  ttsSelection: RouteSelection;
  loading: boolean;
  error: string | null;
  selectChatConnector: (connectorId: string) => void;
  selectTtsConnector: (connectorId: string) => void;
};
```

- Connector 发现：调 `hookClient.data.query({ capability: 'data-api.runtime.route.options' })`，4 次重试，15/30s 轮询。
- Model 选择：按 vendor 字符串匹配（DashScope/OpenAI）+ 硬编码偏好列表。见 `TODO.md` 改进计划。
- 选择持久化于 `localStorage`（`audio-book:chat-connector`、`audio-book:tts-connector`）。

## 5. Adapter 层

Controller 通过 adapter 层将 SDK client 转换为 service 层可用的抽象接口：

| Adapter | 输入 | 输出 | 文件 |
|---------|------|------|------|
| `createLlmClientAdapter` | `ModAiClient` | `LlmClient` | `adapters/llm-adapter.ts` |
| `createTtsClientAdapter` | `HookLlmClient.speech` | `TtsClient` | `adapters/tts-adapter.ts` |

`LlmClient` 和 `TtsClient` 是 `types.ts` 中定义的纯接口，service 层只依赖接口不依赖 SDK，便于单元测试。

## 6. Controller Hook

```typescript
function useAudioBookPageController() {
  const hookClient = useHookClient();
  const aiClient = useAiClient();
  const ttsRoute = useTtsRoute(hookClient, aiClient);
  const clients = useAudioBookClients(hookClient, aiClient, ttsRoute.chatSelection);
  const store = useAudioBookStore();
  const ui = useAudioBookUiState();
  const navigation = useStepNavigation({ currentStep, setCurrentStep, projectState, ... });

  // 15 个 action 方法直接定义在 controller 中：
  const actions = {
    importText, updateProjectName,
    startAnalysis, cancelAnalysis,
    startAutoCast, updateCasting, previewVoice,
    startSynthesis, startTestSynthesis, pauseSynthesis, resumeSynthesis, cancelSynthesis, retryFailedSynthesis,
    playSegmentAudio, stopPlayback,
  };

  return { clients, store, ui, navigation, ttsRoute, actions };
}
```

## 7. Service 层

纯逻辑模块，不依赖 React，通过 `LlmClient` / `TtsClient` 接口注入依赖：

| Service | 文件 | 功能 |
|---------|------|------|
| `analyzeAllChapters` | `services/analysis-pipeline.ts` | 逐章 LLM 分析 + 分块重试 + fidelity gate |
| `splitLongSegments` | `services/segment-post-processor.ts` | 长 segment 在对话引号/句末处拆分 |
| `recommendAllVoices` | `services/voice-recommender.ts` | LLM 声线推荐 + hash 分配兜底 |
| `runSynthesisJob` | `services/synthesis-scheduler.ts` | 滑动窗口并发合成 + 暂停/恢复/取消 |
| `pickTestSegments` | `services/test-segment-picker.ts` | 选取代表性 segment 用于测试合成 |
| `getQwenSystemVoices` | `services/qwen-voice-catalog.ts` | DashScope 声音目录兜底 |

### 关键常量

| 常量 | 值 | 位置 |
|------|-----|------|
| `MAX_CHUNK_CHARS` | 1500 | analysis-pipeline.ts |
| `CHUNK_RETRY_SIZES` | [1500, 1000, 800, 500] | analysis-pipeline.ts |
| `MAX_SEGMENT_CHARS` | 600 | segment-post-processor.ts |
| `MAX_NARRATION_CHARS` | 800 | segment-post-processor.ts |
| `DEFAULT_MAX_CONCURRENCY` | 3 | synthesis-scheduler.ts |
| `MAX_RETRIES` | 2 | synthesis-scheduler.ts |
| `BACKOFF_MS` | [1000, 3000] | synthesis-scheduler.ts |
| `MAX_TTS_TEXT_CHARS` | 300 | synthesis-scheduler.ts |
| `MAX_TEST_TEXT_LENGTH` | 500 | test-segment-picker.ts |

## 8. Step 导航

### 8.1 步骤条 (StepIndicator)

页面顶部常驻 5 步导航条（pill 样式），显示：
- 当前步骤高亮（indigo 底色）
- 可点击已到达的步骤直接跳转
- 未到达的步骤灰色不可点击

### 8.2 STEP_MIN_STATE 映射

每个 step 允许进入的最小 ProjectState 集合：

| Step | 允许的 ProjectState |
|------|-------------------|
| `import` | 全部 11 种状态（始终可访问） |
| `analyze` | `imported`, `analyzing`, `analyzed`, `casting`, `cast_complete`, `synthesizing`, `done`, `done_with_errors`, `cancelled`, `paused` |
| `cast` | `analyzed`, `casting`, `cast_complete`, `synthesizing`, `done`, `done_with_errors`, `cancelled`, `paused` |
| `synth` | `cast_complete`, `synthesizing`, `done`, `done_with_errors`, `cancelled`, `paused` |
| `play` | `done`, `done_with_errors`（另外 `cast_complete`+ 时若 `hasTestAudio=true` 也可进入） |

### 8.3 回退确认

从 Step 3/4/5 回退到 Step 2（重新分析）时，弹出确认对话框。回退操作对应 `project-states.yaml` 中定义的 `side_effects`。

## 9. 各 Step UI 概述

### 9.1 项目列表（首页）

当 `activeProjectId = null` 时显示。

**组件**: `<ProjectListView />`
- 顶部：书本图标 + "AudioBook Studio" 标题
- 创建栏：+ 图标 input + Create 按钮（indigo）
- 项目卡片网格：名称（hover 变 indigo）+ 状态 badge（彩色 pill）+ 日期
- 删除：trash 图标按钮 → 确认弹窗（modal overlay）
- 空状态：大书本图标 + "No projects yet"

### 9.2 Step 1 — ImportStep

居中布局（max-w-lg），标题 "Import Your Text" + 副标题。

- 拖拽上传区（虚线边框 + upload SVG 图标）
- 文本粘贴 textarea
- 导入按钮（indigo + 箭头图标）
- 导入统计信息

### 9.3 Step 2 — AnalyzeStep

左右分栏布局：

- **左侧面板**（w-80）：标题 + LLM provider 选择器 + 章节统计 + Start Analysis 按钮 + 进度条 + 角色 chips + Re-analyze 按钮
- **右侧面板**：segment 预览列表（type badge + speaker + text），空状态提示

### 9.4 Step 3 — CastStep

三段布局：

- **顶栏**：TTS Provider 选择器
- **左侧边栏**（w-56）：角色列表（indigo 选中态）+ Auto 按钮
- **右侧面板**：Voice selector + Speaking Rate slider + Pitch slider + Emotion input + Preview Voice 按钮

### 9.5 Step 4 — SynthesisStep

居中布局（max-w-lg），标题 "Audio Synthesis"。

- 操作按钮：Start Synthesis（indigo）+ Test Synthesis（amber outline）
- 进度卡片：segment 计数 + 进度条 + 剩余时间 + Pause/Cancel
- 测试模式结果：amber 卡片 + 逐段试听 + Start Full Synthesis / Re-test
- 完成状态：success/warning 图标 + 统计 + 失败 segment 详情

### 9.6 Step 5 — PlaybackStep

全高度布局 + 底部固定播放器栏。

- **章节标签页**：indigo 活跃态
- **文本跟读区**：当前 segment 左侧 indigo 竖条标记，speaker 标签
- **底部播放器栏**：seek bar + 居中控制区（prev / play-pause / next）+ 倍速按钮（0.5x~2.0x 循环）

## 10. 文件结构

```
audio-book/src/
├── index.ts
├── runtime-mod.ts
├── contracts.ts                          # MOD_ID, capabilities, slots, error codes
├── manifest.ts                           # MANIFEST object
├── types.ts                              # 全部实体类型 + LlmClient/TtsClient 接口
├── audio-book-page.tsx                   # 顶层页面入口（项目列表 / step 内容切换）
│
├── adapters/
│   ├── llm-adapter.ts                    # ModAiClient → LlmClient
│   └── tts-adapter.ts                    # HookLlmClient.speech → TtsClient
│
├── controllers/
│   ├── audio-book-page-controller.ts     # 主 Controller Hook（编排全部逻辑 + 15 action）
│   ├── use-audio-book-ui-state.ts        # 临时 UI 状态
│   ├── use-audio-book-clients.ts         # hookClient/aiClient/llmClient/ttsClient 创建
│   ├── use-step-navigation.ts            # Step 导航逻辑 + STEP_MIN_STATE 映射
│   └── use-tts-route.ts                  # TTS/Chat connector 发现 + model 选择
│
├── services/
│   ├── analysis-pipeline.ts              # LLM 逐章分析编排（含分块重试 + fidelity gate）
│   ├── segment-post-processor.ts         # 长 segment 拆分（对话引号/句末边界）
│   ├── voice-recommender.ts              # 声线推荐（LLM + hash 分配 + 默认兜底）
│   ├── voice-recommender-prompts.ts      # 声线推荐的 system/user prompt 模板
│   ├── synthesis-scheduler.ts            # 批量合成调度（滑动窗口并发 + 暂停/恢复/取消）
│   ├── test-segment-picker.ts            # 测试合成 segment 选取
│   └── qwen-voice-catalog.ts             # DashScope Qwen 声音目录兜底
│
├── components/
│   ├── ui/                               # 共享 UI 原语（indigo 主题）
│   │   ├── button.tsx                    # Button (primary/secondary/destructive/ghost)
│   │   ├── select.tsx                    # Select (Radix UI)
│   │   ├── progress.tsx                  # Progress bar (Radix UI)
│   │   ├── slider.tsx                    # Slider (Radix UI)
│   │   ├── badge.tsx                     # Badge / TierBadge / SegmentTypeBadge
│   │   ├── dialog.tsx                    # ConfirmDialog
│   │   └── tooltip.tsx                   # Tooltip (Radix UI)
│   ├── shell/
│   │   ├── audio-book-shell.tsx          # 外壳布局（header/content/footer + toast + confirm）
│   │   ├── step-indicator.tsx            # 步骤导航条（pill 样式）
│   │   └── step-footer.tsx              # 上/下一步按钮（箭头图标）
│   ├── project/
│   │   ├── project-header.tsx            # 书本图标 + "AudioBook Studio" + StepIndicator
│   │   └── project-list-view.tsx         # 项目列表 + 创建 + 删除确认弹窗
│   ├── import/
│   │   └── import-step.tsx               # 居中布局：上传区 + 粘贴区
│   ├── analyze/
│   │   └── analyze-step.tsx              # 左右分栏：控制面板 + segment 预览
│   ├── cast/
│   │   └── cast-step.tsx                 # 三段：provider 选择 + 角色列表 + 声线配置
│   ├── synth/
│   │   └── synthesis-step.tsx            # 居中：操作按钮 + 进度 + 测试模式 + 完成状态
│   └── playback/
│       └── playback-step.tsx             # 章节标签 + 文本跟读 + 底部播放器栏
│
└── step-content.tsx                      # Step 路由（按 currentStep 渲染对应组件）
```

## 11. 测试适配策略

### 11.1 Layer 2 (脱离 desktop 的单元/集成测试)

`services/` 目录下的纯逻辑模块通过注入 mock `LlmClient` / `TtsClient` 接口进行测试：

| Service | 测试文件 | 测试方式 |
|---------|---------|---------|
| `analysis-pipeline.ts` | `test/unit/analysis-pipeline.test.ts` | Mock LlmClient，验证分块重试 + fallback |
| `synthesis-scheduler.ts` | `test/unit/synthesis-queue.test.ts` | Mock TtsClient，验证并发 + 重试 + 暂停 |
| `segment-post-processor.ts` | `test/unit/segment-post-processor.test.ts` | 纯函数测试，验证拆分逻辑 |
| `test-segment-picker.ts` | `test/unit/test-segment-picker.test.ts` | 纯函数测试 |
| `voice-recommender.ts` | — | 依赖 LLM，适合 integration test |
| chapter splitting | `test/unit/chapter-split.test.ts` | 纯函数测试 |
| TTS adapter | `test/unit/tts-adapter.test.ts` | Mock speech API |
| character tier | `test/unit/character-tier.test.ts` | 纯函数测试 |
| JSON repair | `test/unit/json-repair.test.ts` | 纯函数测试 |
| text fidelity | `test/unit/text-fidelity.test.ts` | 纯函数测试 |

当前共 9 个测试文件，63 个测试用例。
