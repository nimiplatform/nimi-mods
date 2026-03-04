# Meeting Scribe Spec Index

> Mod ID: `world.nimi.meeting-scribe`
> Status: Draft
> Version: 0.1.0

## Overview

Meeting Scribe 是一个 nimi-mod，提供 AI 会议转录与分析能力。核心流程：上传会议录音 → STT 转录（含说话人分离）→ 一次性生成结构化摘要（要点 + 决议 + 待办事项）。支持 token-api（云端 Gemini）和 local-only（本地 Whisper）两种路由模式。

## Architecture

```
meeting-scribe (nimi-mod)
│
├── aiClient.transcribeAudio()       → STT 转录 (Gemini / Whisper)
├── aiClient.generateObject()        → 结构化分析 (摘要 + 待办)
├── hook.ui.register                 → 侧边栏 + 内容页
├── hook.event.publish/subscribe     → 转录/分析进度事件
│
├── In-memory store                  → Phase 1 数据存储
└── [IndexedDB]                      → Phase 2 持久化
```

## Spec Structure

### Kernel (Authoritative Facts)

| Document | Rule IDs | Content |
|----------|----------|---------|
| [`kernel/entity-contract.md`](kernel/entity-contract.md) | MS-ENT-001 ~ 004 | 4 个核心实体定义 |
| [`kernel/pipeline-contract.md`](kernel/pipeline-contract.md) | MS-PIPE-001 ~ 005 | 三步流水线 + 状态转换 + 错误处理 |
| [`kernel/routing-contract.md`](kernel/routing-contract.md) | MS-ROUTE-001 ~ 003 | 路由策略 + local-only 模式 + 降级规则 |

### Kernel Tables (Structured Facts)

| Table | Content |
|-------|---------|
| [`tables/entities.yaml`](kernel/tables/entities.yaml) | 实体字段定义 |
| [`tables/meeting-states.yaml`](kernel/tables/meeting-states.yaml) | 会议状态机 |
| [`tables/error-codes.yaml`](kernel/tables/error-codes.yaml) | 错误码定义 |

### Domain Documents

| Document | Covers |
|----------|--------|
| [`transcription.md`](transcription.md) | Step 1 音频上传 + Step 2 STT 转录 |
| [`analysis.md`](analysis.md) | Step 3 结构化分析（摘要 + 决议 + 待办） |
| [`frontend.md`](frontend.md) | 组件树、状态管理、UI 布局 |
| [`testing.md`](testing.md) | 独立冒烟测试脚本（不依赖 nimi-desktop） |
| [`stt-gap-analysis.md`](stt-gap-analysis.md) | **[OPEN]** Runtime STT 适配器与 cloud provider 不匹配的调查与解决路径 |

## Reading Paths

### "了解 Meeting Scribe 全貌"
1. 本文件 (INDEX.md)
2. `kernel/pipeline-contract.md` (三步流水线)
3. `kernel/entity-contract.md` (数据模型)
4. `frontend.md` (组件架构)

### "修改 STT 转录行为"
1. `kernel/routing-contract.md` (路由策略)
2. `kernel/tables/meeting-states.yaml` (状态机)
3. `transcription.md` (转录实现细节)

### "修改摘要/待办提取"
1. `kernel/entity-contract.md` § MS-ENT-003, MS-ENT-004
2. `analysis.md` (prompt 设计 + schema)

### "修改路由策略 / 添加 local-only 支持"
1. `kernel/routing-contract.md`
2. `transcription.md` § 3 (路由切换)

### "添加新的音频格式"
1. `kernel/pipeline-contract.md` § MS-PIPE-002
2. `transcription.md` § 2.1

### "运行独立冒烟测试"
1. `testing.md` (测试架构 + 运行命令)
2. `test/smoke/stt-transcribe.test.ts`
3. `test/smoke/analysis-generate.test.ts`

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| STT 方案 | **待定** — 受 runtime adapter 限制（见 [`stt-gap-analysis.md`](stt-gap-analysis.md)） | 首选路径 B: DashScope paraformer-v2（需改 runtime adapter） |
| 分析策略 | 单次 generateObject | 一次调用出摘要+决议+待办，减少延迟和 token 消耗 |
| 存储方案 | In-memory (Phase 1) | 快速验证 pipeline；Phase 2 迁移 IndexedDB |
| Local-only | Route hint 切换 | 利用 runtime 已有路由能力，mod 代码无需分支 |
| 说话人分离 | Gemini 原生 (Phase 1) | 避免 pyannote Python 依赖；local-only 模式降级为无说话人 |
| 语言检测 | STT 自动检测 | Gemini/Whisper 均支持自动语言检测，无需用户手选 |
| Pipeline 编排 | Mod 内编排 | Runtime workflow SDK 尚未投影；保留 PipelineStage 抽象为 Phase 2 迁移留接口 |

## V1 Scope vs Future

| Feature | V1 | Future |
|---------|-----|--------|
| 音频文件上传 | ✓ | |
| 实时麦克风录制 | | ✓ |
| Cloud STT 转录 | **BLOCKED** — 待 runtime adapter 适配 | ✓ |
| 本地 Whisper STT | ✓ (local-only 模式) | |
| 说话人分离 (DashScope paraformer-v2) | **BLOCKED** — 同上 | ✓ |
| 说话人分离 (本地 pyannote) | | ✓ |
| 结构化摘要 + 待办 | ✓ | |
| Local-only 开关 | ✓ | |
| In-memory 存储 | ✓ | |
| IndexedDB 持久化 | | ✓ |
| 会议历史列表 | | ✓ |
| 导出 Markdown / PDF | | ✓ |
| Runtime DAG workflow | | ✓ |
| 多文件批量处理 | | ✓ |
| 会议模板 (standup / retro) | | ✓ |

## Dependencies

### Mod Capabilities (Required)

```yaml
- llm.text.generate
- llm.text.stream
- llm.speech.transcribe
- ui.register.ui-extension.app.sidebar.mods
- ui.register.ui-extension.app.content.routes
- event.publish.ms:*
- event.subscribe.ms:*
```

### External Dependencies

- None beyond `@nimiplatform/sdk` (all capabilities via mod hooks)
