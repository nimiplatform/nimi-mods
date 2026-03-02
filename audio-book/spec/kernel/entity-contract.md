# Entity Contract

> Owner Domain: `VS-ENT-*`
> Authoritative fact source: `tables/entities.yaml`

本合约定义 Audio Book 的全部核心实体及其字段语义。实体以 YAML 表为唯一事实源，本文档提供规则级约束。

---

## VS-ENT-001 — VoiceProject

有声书项目是 Audio Book 的顶层聚合根。

- 每个项目拥有唯一 ULID 标识。
- 项目名称由用户命名，不可为空。
- 项目状态遵循 `tables/project-states.yaml` 定义的状态机。
- 一个项目恰好关联一份 SourceText（按章节组织的原始文本）。
- 项目数据持久化于 IndexedDB，key 前缀为 `vs:project:{id}`。

## VS-ENT-002 — SourceChapter

导入文本按章节组织的最小存储单元。

- `index` 从 0 开始，表示章节在全书中的顺序。
- `title` 可为空（由导入时自动检测或用户手动填写）。
- `rawText` 存储该章节的原始纯文本，不含格式标记。
- 章节拆分策略：优先按 `第X章` / `Chapter X` 等模式自动分割；无法识别时整篇文本作为单章节。

## VS-ENT-003 — Script

结构化脚本是 LLM 分析的产物，将原始文本转换为有序的语音段落序列。

- 一个项目恰好生成一份 Script。
- Script 由 `ScriptSegment[]` 组成，全局有序（跨章节连续编号）。
- Script 可被用户手动修改（调整说话人标注、合并/拆分段落）。

## VS-ENT-004 — ScriptSegment

语音段落是 TTS 合成的最小单位。

- 每个 segment 拥有唯一 ULID 标识。
- `type` 取值受 `tables/segment-types.yaml` 约束。
- `speaker` 字段引用 CharacterProfile.name；旁白段落固定为 `"narrator"`。
- `text` 为该段落的合成文本，不可为空。
- `startOffset` / `endOffset` 必须引用 SourceChapter.rawText 的字符区间（0-based，左闭右开）。
- `text` 必须与 `SourceChapter.rawText.slice(startOffset, endOffset)` 完全一致。
- `emotion` 可选，提示 TTS 的情绪参数（happy / sad / angry / calm / fearful / surprised）。
- 同一角色的连续对话合并为一个 segment（按段落切分，非按句切分）。
- `chapterIndex` 关联 SourceChapter.index。

## VS-ENT-005 — CharacterProfile

角色档案描述从文本中提取的角色信息。

- `name` 是角色的唯一标识（在项目范围内）。
- `gender`: male / female / neutral。
- `ageGroup`: child / young / adult / elder。
- `traits`: 字符串数组，描述角色性格特征（如 `["温柔", "知性", "沉稳"]`）。
- `segmentCount`: 该角色在 Script 中的段落数量（派生字段，不持久化）。
- `tier`: 角色分级，由 `tables/character-tiers.yaml` 规则计算。
- 角色档案由 LLM 自动生成，用户可手动修改全部字段。

### Narrator 特殊处理

- **Narrator（旁白）是一个特殊的 CharacterProfile**，在 Step 2 分析开始前自动创建：
  - `name = "narrator"`，`gender = neutral`，`ageGroup = adult`，`traits = ["沉稳", "客观"]`。
  - `tier` 始终为 `major`（不受 segmentCount 阈值影响）。
- Narrator 的 VoiceCasting 与普通角色一样在 Step 3 分配。
- 用户可修改 narrator 的 gender / traits / voice，但不可删除或重命名。

## VS-ENT-006 — VoiceCasting

声线分配记录角色与 TTS voice 的映射关系。

- 每个 CharacterProfile 关联至多一个 VoiceCasting。
- `voiceSource`: `preset`（从预设列表选取）或 `designed`（Voice Design 生成，预留）。
- 当 `voiceSource = 'preset'`:
  - `providerId` + `voiceId` 指向具体的 TTS provider voice。
  - `voiceName` 为人类可读名称（如 "Ethan"）。
- 当 `voiceSource = 'designed'`（预留，第一版不实现）:
  - `designPrompt` 存储生成该音色的描述文本。
  - `designedVoiceId` 存储 provider 返回的音色 ID。
- `speakingRate`, `pitch`, `emotion` 为该角色的默认合成参数。
- `previewAudioUri` 存储试听音频的 base64 data URI。

## VS-ENT-007 — SynthesisJob

批量合成任务管理一个项目的完整 TTS 生成过程。

- 一个项目同时只能有一个活跃的 SynthesisJob。
- 任务状态遵循 `tables/job-states.yaml` 定义的状态机。
- `progress` 为派生对象：`{ completed, total, failed }`。
- 任务包含 `SegmentJob[]`，与 ScriptSegment 一一对应。

## VS-ENT-008 — SegmentJob

单个段落的合成任务。

- `segmentId` 引用 ScriptSegment.id。
- `status`: pending / running / done / failed。
- `audioStorageKey`: IndexedDB 存储 key，音频以 Blob 对象存储（非 base64，避免体积膨胀）。
- `durationMs`: 音频时长（毫秒）。
- `retryCount`: 失败重试次数，上限由 VS-SYNTH-003 定义。
- `error`: 失败原因描述。

## VS-ENT-009 — AudioOutput

章节级音频输出的元数据记录。

- 不实际拼接音频文件（第一版采用 segment 队列播放）。
- 记录每章的总时长（各 segment durationMs 之和）。
- `chapterIndex` 关联 SourceChapter.index。
- `segmentIds`: 该章节包含的 segment ID 有序列表，用于播放器顺序播放。
