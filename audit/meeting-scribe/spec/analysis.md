# Analysis

> Domain: Meeting Scribe / Analysis
> Covers: Step 3 (Structured Summary + Action Item Extraction)

## 0. Normative Imports

| Kernel Location | Rule IDs |
|---|---|
| `kernel/entity-contract.md` | MS-ENT-001, MS-ENT-003, MS-ENT-004 |
| `kernel/pipeline-contract.md` | MS-PIPE-004, MS-PIPE-005 |
| `kernel/routing-contract.md` | MS-ROUTE-001 |
| `kernel/tables/meeting-states.yaml` | transcribed → analyzing → done |
| `kernel/tables/error-codes.yaml` | MS_ANALYSIS_* |

## 1. Scope

本文档描述从转录文本到生成结构化摘要（要点 + 决议 + 待办事项）的 LLM 分析流程。

## 2. 分析策略

### 2.1 单次调用

分析采用单次 `aiClient.generateObject()` 调用，一次性输出摘要、决议、待办事项。

优势：
- 减少 API 调用次数和延迟。
- LLM 在完整上下文中做全局判断，避免分步调用导致的信息丢失。
- 结构化输出由 Zod schema 约束，保证类型安全。

### 2.2 调用方式

```typescript
const result = await aiClient.generateObject({
  capability: 'text.generate',
  binding: meeting.localOnly
    ? { source: 'local', connectorId: '', model: '' }
    : { source: 'cloud', connectorId: '', model: '' },
  systemPrompt: buildSystemPrompt(meeting.language),
  prompt: buildAnalysisPrompt(meeting.transcript),
  schema: MeetingSummarySchema,
});
```

### 2.3 System Prompt 设计

```
┌─────────────────────────────────────┐
│ System Prompt:                      │
│   角色：会议记录分析专家             │
│   任务：从转录文本中提取结构化摘要   │
│   输出语言：{detected_language}      │
│   输出格式：见 Zod schema           │
│   注意事项：                        │
│   - 要点控制在 3-10 条              │
│   - 仅记录明确的决议，推测性结论不算 │
│   - 待办需包含负责人（若可识别）     │
│   - 优先级根据上下文语义判断         │
├─────────────────────────────────────┤
│ Input:                              │
│   带说话人标签的完整转录文本         │
│   格式：[Speaker X] (HH:MM:SS) text │
├─────────────────────────────────────┤
│ Expected Output:                    │
│   { keyPoints, decisions,           │
│     actionItems }                   │
└─────────────────────────────────────┘
```

### 2.4 输入格式化

转录文本传入 LLM 前，格式化为带说话人和时间戳的文本：

```typescript
function formatTranscriptForAnalysis(
  segments: TranscriptSegment[],
  speakerMap?: Record<string, string>
): string {
  return segments
    .map((seg) => {
      const speaker = speakerMap?.[seg.speaker] ?? seg.speaker;
      const time = formatMs(seg.startMs); // HH:MM:SS
      return `[${speaker}] (${time}) ${seg.text}`;
    })
    .join('\n');
}
```

## 3. 输出 Schema

```typescript
const ActionItemSchema = z.object({
  description: z.string().min(1),
  assignee: z.string().nullable(),
  dueDate: z.string().nullable(),
  priority: z.enum(['high', 'medium', 'low']),
});

const MeetingSummarySchema = z.object({
  keyPoints: z.array(z.string().min(1)).min(1).max(10),
  decisions: z.array(z.string().min(1)),
  actionItems: z.array(ActionItemSchema),
});
```

- `keyPoints`: 1-10 条核心要点，每条为一句话概述。
- `decisions`: 0-N 条明确决议。无决议时为空数组。
- `actionItems`: 0-N 条待办事项。无待办时为空数组。

## 4. 说话人与待办关联

- `actionItems[].assignee` 引用转录中的说话人标签。
- 如果用户在 Step 2 完成后编辑了说话人映射（`Speaker 1 → 张三`），分析 prompt 中使用映射后的姓名。
- LLM 从对话上下文推断负责人：
  - 直接承诺："我来负责这个" → assignee = 说话人
  - 被指派："张三你来跟进" → assignee = 张三
  - 无法确定 → assignee = null

## 5. 语言处理

- 分析输出语言自动跟随 `Meeting.language`（STT 检测结果）。
- System prompt 中包含语言指令：`"请使用{language}输出摘要"` / `"Please output summary in {language}"`。
- 不对输出语言做硬编码，允许多语言会议以主要语言输出。

## 6. 进度事件

```typescript
hook.event.publish('ms:analysis:progress', {
  meetingId: meeting.id,
  status: 'processing', // 'processing' | 'complete' | 'error'
});
```

分析为单次调用，无中间进度。status 仅在 `processing` → `complete` / `error` 之间转换。

## 7. 错误处理

- `MS_ANALYSIS_PROVIDER_UNAVAILABLE`: 文本分析模型不可用，提示检查路由或切换模式。
- `MS_ANALYSIS_CONTEXT_TOO_LONG`: 转录文本超出 context window，提示录音可能过长。
  - Phase 2 可考虑分段摘要 + 合并策略。
- `MS_ANALYSIS_PARSE_ERROR`: LLM 输出不符合 Zod schema，提供重试按钮。

## 8. PipelineStage 抽象

```typescript
const analyzeStage: PipelineStage<TranscriptSegment[], MeetingSummary> = {
  id: 'analyze',
  async execute(segments, ctx) {
    const transcript = formatTranscriptForAnalysis(segments);
    return ctx.runtimeClient.ai.text.generate({
      binding: ctx.localOnly
        ? { source: 'local', connectorId: '', model: '' }
        : { source: 'cloud', connectorId: '', model: '' },
      systemPrompt: buildSystemPrompt(ctx.language),
      prompt: transcript,
    });
  },
};
```
