# Voice Casting

> Domain: Audio Book / Voice Casting
> Covers: Step 3 (Cast)

## 0. Normative Imports

| Kernel Location | Rule IDs |
|---|---|
| `kernel/entity-contract.md` | VS-ENT-005, VS-ENT-006 |
| `kernel/pipeline-contract.md` | VS-PIPE-006 |
| `kernel/tables/character-tiers.yaml` | major, supporting, minor |
| `kernel/tables/project-states.yaml` | analyzed → casting → cast_complete |

## 1. Scope

本文档描述角色分级、声线分配（预设 / Voice Design）、试听预览的完整流程。

## 2. 角色分级

进入 Step 3 时，系统根据 segment 数量自动计算每个角色的 tier：

| Tier | 条件 | 声线策略 |
|------|------|---------|
| major | segmentCount >= 20 | AI 推荐 + 用户微调 |
| supporting | 5 <= segmentCount < 20 | AI 推荐 + 用户微调 |
| minor | segmentCount < 5 | 按性别自动分配默认声线 |

- 阈值可在项目设置中调整。
- 用户可手动升级任何 minor 角色为 supporting/major 处理级别。

## 3. AI 自动推荐（第一版：预设选取）

### 3.1 推荐流程

```
输入:
  - CharacterProfile { name, gender, ageGroup, traits }
  - 可用声线列表（从 hook.llm.speech.listVoices() 获取）

LLM 任务:
  "从可用声线列表中，为以下角色选择最合适的声线。
   考虑角色的性别、年龄段和性格特征。"

输出:
  { voiceId, providerId, reason }
```

- 使用 `aiClient.generateObject()` 确保输出结构化。
- LLM 只能从实际可用的声线中选取（不能幻构不存在的 voiceId）。
- 推荐理由 `reason` 展示在 UI 中供用户参考。

### 3.2 批量推荐

点击「一键生成全部主要角色音色」时：
1. 调用 `hook.llm.speech.listVoices()` 获取当前可用声线。
2. 将全部 major + supporting 角色的 profiles 打包，一次 LLM 调用完成所有推荐。
3. LLM 需确保不同角色尽量分配不同声线（避免声音重复）。
4. 若可用声线不足以覆盖全部角色，可复用但调整 speakingRate / pitch 以区分。

### 3.3 低频角色默认分配

minor 角色不调用 LLM，直接按规则分配：
- `gender = male` → 默认男声（Ethan 或 provider 首个男声）
- `gender = female` → 默认女声（Cherry 或 provider 首个女声）
- `gender = neutral` → 默认中性声（Alloy 或 provider 首个可用声线）

## 4. Voice Design（预留，第一版不实现）

### 4.1 设计流程（未来版本）

```
输入:
  CharacterProfile.traits → 自动生成 voice design prompt
  例: "中年男性，嗓音低沉略带沙哑，说话直接豪爽"

调用:
  hook.llm.speech.designVoice(prompt, provider)
  → 需要 runtime 扩展 DesignVoice RPC

输出:
  { designedVoiceId: "qwen3-voice-xxx", previewAudioUri: "..." }
```

### 4.2 数据模型预留

VoiceCasting 实体已预留 `voiceSource = 'designed'` 路径：
- `designPrompt`: 生成该音色的描述文本
- `designedVoiceId`: Provider 返回的音色 ID

第一版仅走 `voiceSource = 'preset'` 路径。

## 5. 参数调整

每个角色的声线分配还包括可调参数：

| 参数 | 范围 | 默认值 | 说明 |
|------|------|--------|------|
| speakingRate | 0.5 - 2.0 | 1.0 | 语速倍率 |
| pitch | -1.0 - 1.0 | 0 | 音调偏移 |
| emotion | happy/sad/angry/calm/... | (空) | 默认情绪 |

- 这些是角色级默认值，合成时 segment 自身的 emotion 可覆盖。
- 调整参数后，试听立即生效，但不影响已合成的 segment（需重新合成）。

## 6. 试听预览

### 6.1 试听流程

1. 从该角色的 segments 中选取一句代表性台词（默认选段落数最多的前 3 句之一）。
2. 调用 `hook.llm.speech.synthesize({ text, voiceId, providerId, speakingRate, pitch, emotion })`。
3. 返回的 `audioUri` 在浏览器端播放。
4. 用户可点击「换一句」随机切换试听台词。

### 6.2 试听缓存

- 试听音频存入 VoiceCasting.previewAudioUri。
- 切换声线或调整参数后，缓存失效，需重新试听。

## 7. 角色管理

### 7.1 合并角色

用户可将两个角色合并为一个（处理 LLM 未能自动去重的情况）：
- 选择保留哪个角色的 profile 信息。
- 被合并角色的全部 segments 的 speaker 字段更新为保留角色的 name。
- 被合并角色从列表中移除。

### 7.2 拆分角色

用户可将一个角色拆分为两个（处理 LLM 错误合并的情况）：
- 用户为新角色命名并设置 profile。
- 手动选择哪些 segments 归属新角色。

## 8. 进入 Step 4 的前提

- 全部 tier = major 和 tier = supporting 的角色已分配声线。
- minor 角色已自动分配默认声线。
- Narrator（旁白）已分配声线。
- 满足上述条件后，「开始合成」按钮可用。
