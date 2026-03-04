# Entity Contract

> Owner Domain: `MS-ENT-*`
> Authoritative fact source: `tables/entities.yaml`

本合约定义 Meeting Scribe 的全部核心实体及其字段语义。实体以 YAML 表为唯一事实源，本文档提供规则级约束。

---

## MS-ENT-001 — Meeting

会议记录是 Meeting Scribe 的顶层聚合根。

- 每条会议记录拥有唯一 ULID 标识。
- `title` 由用户命名或从摘要自动生成，不可为空。
- `status` 遵循 `tables/meeting-states.yaml` 定义的状态机。
- 一条会议记录关联一个音频文件引用、一组转录片段、一份结构化摘要。
- `audioFileName` 和 `audioMimeType` 记录上传文件的元信息。
- `audioDurationMs` 在 STT 完成后填充（从转录结果推导）。
- `language` 由 STT 自动检测，用户不手动选择。
- `localOnly` 标记该会议是否强制本地路由处理。
- Phase 1 数据存储于内存；Phase 2 迁移 IndexedDB，key 前缀为 `ms:meeting:{id}`。

## MS-ENT-002 — TranscriptSegment

带时间戳和说话人标签的转录片段，是 STT 的直接产物。

- 每个 segment 拥有唯一 ULID 标识。
- `index` 从 0 开始，表示在完整转录中的顺序。
- `startMs` / `endMs` 为相对于音频起始点的毫秒时间戳。
- `speaker` 为说话人标签：
  - Gemini token-api 模式：由 STT 自动标注（如 `"Speaker 1"`, `"Speaker 2"`）。
  - Local-only 模式（Whisper）：固定为 `"Unknown"`（无说话人分离能力）。
  - 用户可手动编辑说话人标签（映射为真实姓名）。
- `text` 为该片段的转录文本，不可为空。
- `confidence` 为 STT 返回的置信度分数（0.0 ~ 1.0），可选。

## MS-ENT-003 — MeetingSummary

结构化摘要是 LLM 分析的产物，由一次 `generateObject()` 调用生成。

- 一条会议记录恰好生成一份 MeetingSummary。
- `keyPoints`: 字符串数组，会议核心要点（3-10 条）。
- `decisions`: 字符串数组，会议中做出的明确决议。
- `actionItems`: ActionItem 数组，提取的待办事项。
- `language` 继承自 Meeting 的 STT 自动检测语言，摘要以同语言输出。

## MS-ENT-004 — ActionItem

从会议内容中提取的待办事项。

- 每个 ActionItem 拥有唯一 ULID 标识。
- `description` 为待办描述，不可为空。
- `assignee` 为负责人，引用 TranscriptSegment.speaker 标签；若无法确定负责人则为空。
- `dueDate` 为截止日期，从会议内容中提取；若未提及则为空。
- `priority` 为优先级：`high` / `medium` / `low`，由 LLM 根据上下文语义判断。
