# Meeting Scribe — Single Source of Truth

> Mod ID: `world.nimi.meeting-scribe`
> Kind: capability-mod
> License: MIT

## What

AI 会议助手 mod。上传会议录音，自动转录（含说话人分离）、生成结构化摘要与待办事项。支持 cloud（云端）和 local-only（本地）两种路由模式，满足企业隐私合规场景。

## Core Flow

```
上传音频 → STT 转录 (含说话人分离) → 结构化分析 (摘要 + 待办)
 (Step 1)        (Step 2)                  (Step 3)
```

## Spec Entry Point

[`spec/INDEX.md`](spec/INDEX.md)

## Key Entities

| Entity | Description |
|--------|-------------|
| Meeting | 会议记录（顶层聚合根） |
| TranscriptSegment | 带时间戳和说话人标签的转录片段 |
| MeetingSummary | 结构化摘要（要点 + 决议 + 待办） |
| ActionItem | 提取的待办事项（负责人 + 描述 + 截止日期） |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| UI | React 19 (mod component) |
| Storage | In-memory (Phase 1)，IndexedDB (Phase 2) |
| AI (STT) | aiClient.transcribeAudio (Gemini cloud / local Whisper) |
| AI (text) | aiClient.generateObject (结构化摘要 + 待办提取) |
| Audio | HTML5 File API (文件上传) |

## V1 Boundary

**In scope:**
- 音频文件上传 (WAV / MP3 / M4A / WebM)
- Gemini cloud STT 转录（含说话人分离）
- 一次性结构化分析（摘要 + 决议 + 待办）
- Local-only 开关（强制本地路由，说话人分离降级）
- 最小 UI：sidebar 入口 + 上传页 + 结果展示页
- 语言自动检测

**Out of scope (Phase 2+):**
- 实时麦克风录制
- 本地说话人分离 (pyannote)
- IndexedDB 持久化
- 会议历史列表与搜索
- 导出为 Markdown / PDF
- Runtime DAG workflow 集成
- 多文件批量处理
