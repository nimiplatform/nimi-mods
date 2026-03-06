# Audio Book — Single Source of Truth

> Mod ID: `world.nimi.audio-book`
> Kind: capability-mod
> License: MIT

## What

多角色 AI 配音 / 有声书生成 mod。将小说文本转化为多角色配音的有声书，支持文本跟读式播放。

## Core Flow

```
导入文本 → AI 分析 → 声线分配 → 批量合成 → 播放
 (Step 1)   (Step 2)   (Step 3)   (Step 4)   (Step 5)
```

## Spec Entry Point

[`spec/INDEX.md`](spec/INDEX.md)

## Key Entities

| Entity | Description |
|--------|-------------|
| VoiceProject | 有声书项目（顶层聚合根） |
| SourceChapter | 按章节组织的原始文本 |
| Script / ScriptSegment | 结构化脚本（LLM 分析产物） |
| CharacterProfile | 角色档案（性别、年龄、性格特征） |
| VoiceCasting | 角色 ↔ TTS 声线映射 |
| SynthesisJob / SegmentJob | 批量合成任务管理 |
| AudioOutput | 章节级音频输出元数据 |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| UI | React 19 (mod component) |
| Storage | IndexedDB (audio + project data) |
| AI (text) | runtime.ai.text.generate/stream |
| AI (speech) | runtime.media.tts.synthesize |
| Playback | HTML5 Audio API |
| Export (optional) | Web Audio API |

## V1 Boundary

- 文本导入: .txt 文件 + 粘贴
- 声线: 预设列表选取（DashScope / Volcengine / OpenAI）
- 合成: 批量合成 + 测试合成（选取 2-3 段验证声线效果）
- 播放: Segment 队列 + 文本跟读 + 播放速率调整 (0.5x-2.0x)
- 不含: epub、Voice Design、背景音乐、全书导出、书签
