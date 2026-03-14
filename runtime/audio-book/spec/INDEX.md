# Audio Book Spec Index

> Mod ID: `world.nimi.audio-book`
> Status: Draft
> Version: 0.1.0

## Overview

Audio Book 是一个 nimi-mod，提供多角色 AI 配音 / 有声书生成能力。核心流程：导入小说文本 → AI 分析角色与对话 → 为每个角色分配声线 → 批量生成有声书 → 文本跟读式播放。

## Architecture

```
audio-book (nimi-mod)
│
├── runtime.ai.text.generate         → 脚本分析、角色提取、声线推荐
├── runtime.media.tts.listVoices     → 获取可用声线列表
├── runtime.media.tts.synthesize     → 单段 TTS 合成
├── hook.ui.register                 → 侧边栏 + 内容页
├── hook.event.publish/subscribe     → 合成进度事件
│
├── Host storage (`sqlite` + `files`) → 项目数据 + 音频存储
└── Web Audio API                    → 播放 + 可选导出
```

## Spec Structure

### Kernel (Authoritative Facts)

| Document | Rule IDs | Content |
|----------|----------|---------|
| [`kernel/index.md`](kernel/index.md) | VS-* | Rule ID format + fact sources |
| [`kernel/capability-contract.md`](kernel/capability-contract.md) | VS-CAP-001 ~ 006 | Runtime/hook capability contract |
| [`kernel/entity-contract.md`](kernel/entity-contract.md) | VS-ENT-001 ~ 009 | 9 个核心实体定义 |
| [`kernel/pipeline-contract.md`](kernel/pipeline-contract.md) | VS-PIPE-001 ~ 008 | 五步流水线 + 测试合成 + 状态转换 |
| [`kernel/synthesis-contract.md`](kernel/synthesis-contract.md) | VS-SYNTH-001 ~ 007 | 批量合成执行策略 |
| [`kernel/error-model.md`](kernel/error-model.md) | VS-ERR-001 ~ 004 | Error envelope + fail-close boundaries |
| [`kernel/acceptance-contract.md`](kernel/acceptance-contract.md) | VS-ACC-001 ~ 002 | Acceptance gate contract |

### Kernel Tables (Structured Facts)

| Table | Content |
|-------|---------|
| [`tables/capabilities.yaml`](kernel/tables/capabilities.yaml) | runtime/hook capabilities |
| [`tables/entities.yaml`](kernel/tables/entities.yaml) | 实体字段定义 |
| [`tables/segment-types.yaml`](kernel/tables/segment-types.yaml) | 段落类型枚举 |
| [`tables/project-states.yaml`](kernel/tables/project-states.yaml) | 项目状态机 |
| [`tables/job-states.yaml`](kernel/tables/job-states.yaml) | 合成任务状态机 |
| [`tables/character-tiers.yaml`](kernel/tables/character-tiers.yaml) | 角色分级规则 |
| [`tables/reason-codes.yaml`](kernel/tables/reason-codes.yaml) | 错误码定义 |
| [`tables/acceptance-cases.yaml`](kernel/tables/acceptance-cases.yaml) | 验收用例与门禁命令 |

### Generated Views

| File | Source |
|------|--------|
| [`kernel/generated/index.md`](kernel/generated/index.md) | Generated table index |
| [`kernel/generated/capabilities.md`](kernel/generated/capabilities.md) | `tables/capabilities.yaml` |
| [`kernel/generated/entities.md`](kernel/generated/entities.md) | `tables/entities.yaml` |
| [`kernel/generated/segment-types.md`](kernel/generated/segment-types.md) | `tables/segment-types.yaml` |
| [`kernel/generated/project-states.md`](kernel/generated/project-states.md) | `tables/project-states.yaml` |
| [`kernel/generated/job-states.md`](kernel/generated/job-states.md) | `tables/job-states.yaml` |
| [`kernel/generated/character-tiers.md`](kernel/generated/character-tiers.md) | `tables/character-tiers.yaml` |
| [`kernel/generated/reason-codes.md`](kernel/generated/reason-codes.md) | `tables/reason-codes.yaml` |
| [`kernel/generated/acceptance-cases.md`](kernel/generated/acceptance-cases.md) | `tables/acceptance-cases.yaml` |

### Domain Documents

| Document | Covers |
|----------|--------|
| [`script-analysis.md`](script-analysis.md) | Step 1 导入 + Step 2 AI 分析 |
| [`voice-casting.md`](voice-casting.md) | Step 3 声线分配 |
| [`batch-synthesis.md`](batch-synthesis.md) | Step 4 批量合成 |
| [`playback.md`](playback.md) | Step 5 播放 + 导出 |
| [`frontend.md`](frontend.md) | 组件树、状态管理、UI 布局、测试适配 |

## Reading Paths

### "了解 Audio Book 全貌"
1. 本文件 (INDEX.md)
2. `kernel/pipeline-contract.md` (五步流水线)
3. `kernel/entity-contract.md` (数据模型)
4. `kernel/capability-contract.md` (runtime/hook contract)
5. `frontend.md` (组件架构)

### "修改 UI / 添加组件"
1. `frontend.md` (组件树 + 状态管理)
2. 对应 Step 的 domain doc

### "修改合成策略"
1. `kernel/synthesis-contract.md`
2. `kernel/tables/job-states.yaml`
3. `batch-synthesis.md`

### "修改角色分级"
1. `kernel/tables/character-tiers.yaml`
2. `kernel/entity-contract.md` § VS-ENT-005
3. `voice-casting.md` § 2

### "修改播放器行为"
1. `kernel/pipeline-contract.md` § VS-PIPE-008
2. `playback.md`

### "添加新的段落类型"
1. `kernel/tables/segment-types.yaml`
2. `kernel/entity-contract.md` § VS-ENT-004
3. `script-analysis.md` § 3.3

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| 存储方案 | Host sqlite + files | 结构化状态与大音频文件分离，且由宿主按 mod 隔离 |
| 播放方式 | Segment 队列播放 | 避免音频拼接的内存压力，实现简单 |
| 段落切分 | 按段落（非按句） | TTS 效果更自然，segment 数量更少 |
| 音频格式 | mp3 | 体积与质量的平衡 |
| 文本导入 | .txt + 粘贴 | 第一版最小可用，epub 后续迭代 |
| Voice Design | 预留不实现 | Runtime 暂不支持，等 Qwen3 Voice Design 接入 |
| 音频导出 | 可选功能 | 核心体验基于在线播放，导出有内存限制 |

## V1 Scope vs Future

| Feature | V1 | Future |
|---------|-----|--------|
| 文本导入 (.txt) | ✓ | |
| epub 导入 | | ✓ |
| AI 脚本分析 | ✓ | |
| 角色分级 | ✓ | |
| 预设声线选取 | ✓ | |
| Qwen3 Voice Design | 预留 | ✓ |
| 声线云端同步 | | ✓ |
| 批量合成 | ✓ | |
| 文本跟读播放 | ✓ | |
| 测试合成 (Test Synthesis) | ✓ | |
| 章节音频导出 | ✓ (可选) | |
| 全书导出 | | ✓ |
| 背景音乐 | | ✓ |
| 段间停顿控制 | | ✓ |
| 播放速率调整 | ✓ | |
| 书签功能 | | ✓ |

## Dependencies

### Mod Capabilities (Required)

```yaml
- runtime.ai.text.generate
- runtime.media.tts.list.voices
- runtime.media.tts.synthesize
- runtime.route.list.options
- runtime.route.resolve
- ui.register.ui-extension.app.sidebar.mods
- ui.register.ui-extension.app.content.routes
- event.publish.ab:*
- event.subscribe.ab:*
```

### External Dependencies

- None beyond `@nimiplatform/sdk` (all capabilities via mod hooks)
