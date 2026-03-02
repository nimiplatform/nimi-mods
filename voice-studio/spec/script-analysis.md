# Script Analysis

> Domain: Voice Studio / Script Analysis
> Covers: Step 1 (Import) + Step 2 (Analyze)

## 0. Normative Imports

| Kernel Location | Rule IDs |
|---|---|
| `kernel/entity-contract.md` | VS-ENT-001, VS-ENT-002, VS-ENT-003, VS-ENT-004, VS-ENT-005 |
| `kernel/pipeline-contract.md` | VS-PIPE-004, VS-PIPE-005 |
| `kernel/tables/segment-types.yaml` | dialogue, narration, inner_thought, sound_effect |
| `kernel/tables/project-states.yaml` | draft → imported → analyzing → analyzed |

## 1. Scope

本文档描述从用户导入原始文本到生成结构化脚本（Script）和角色档案（CharacterProfile）的完整流程。

## 2. 文本导入 (Step 1)

### 2.1 输入方式

| 方式 | 实现 | 限制 |
|------|------|------|
| 文本粘贴 | `<textarea>` 输入 | 浏览器粘贴板大小限制 |
| 文件上传 | `<input type="file" accept=".txt">` + FileReader API | 单文件 2MB（VS_IMPORT_TOO_LARGE） |

### 2.2 章节拆分

导入文本后，自动按正则匹配拆分章节（VS-PIPE-004）：

```
优先级 1: /^第[一二三四五六七八九十百千\d]+[章节回卷篇部]/m   （中文章节/卷/篇/部）
优先级 2: /^(?:Chapter|Part|Prologue|Epilogue)\s+[\d]+/mi    （英文章节）
优先级 3: /^CHAPTER\s+[IVXLC\d]+/mi                          （罗马数字章节）
兜底:     全文作为单章节
```

拆分结果：
- 匹配行作为 `SourceChapter.title`
- 匹配行之后到下一个匹配行之前的文本作为 `SourceChapter.rawText`
- 用户可在 UI 中手动调整分割点（合并/拆分章节）

### 2.3 导入后状态

- 显示：章节数量、总字数、每章字数分布
- 项目状态: `draft` → `imported`
- 数据持久化到 IndexedDB

## 3. AI 分析 (Step 2)

### 3.1 分析策略

逐章节调用 `aiClient.generateObject()`，采用滑动上下文窗口：

```
┌─────────────────────────────────────┐
│ System Prompt:                      │
│   角色：有声书脚本分析专家           │
│   任务：将小说文本拆分为语音段落     │
│   输出格式：见 Zod schema           │
├─────────────────────────────────────┤
│ Context (前文摘要):                 │
│   已识别角色列表 + traits            │
│   上一章最后 3 个 segments           │
├─────────────────────────────────────┤
│ Input:                              │
│   当前章节全文                       │
├─────────────────────────────────────┤
│ Expected Output:                    │
│   { segments: ScriptSegment[],      │
│     characters: CharacterDelta[] }  │
└─────────────────────────────────────┘
```

### 3.2 输出 Schema

```typescript
const AnalysisOutputSchema = z.object({
  segments: z.array(z.object({
    type: z.enum(['dialogue', 'narration', 'inner_thought', 'sound_effect']),
    speaker: z.string(),
    text: z.string().min(1),
    emotion: z.string().optional(),
  })),
  characters: z.array(z.object({
    name: z.string(),
    gender: z.enum(['male', 'female', 'neutral']),
    ageGroup: z.enum(['child', 'young', 'adult', 'elder']),
    traits: z.array(z.string()),
    isNew: z.boolean(),  // 本章新出场的角色
  })),
});
```

说明：
- 上述 Schema 是 LLM 的章节分析输出。
- 进入项目 Script 持久化前，系统必须为每个 segment 回填 `startOffset/endOffset`，并将 `text` 重写为原文切片。

### 3.3 段落切分原则

- 同一角色的连续对话合并为一个 `dialogue` segment。
- 对话之间的叙述文本作为 `narration` segment。
- 角色内心独白（常以"他想"、"她心想"等标记）作为 `inner_thought`。
- 每个 segment 的文本长度建议在 20-500 字之间：
  - 过短（< 20 字）的旁白段落可与相邻旁白合并。
  - 过长（> 500 字）的段落可在自然断句处拆分。

### 3.4 角色识别与去重

- LLM 在分析每章时，接收前文已识别的角色列表作为上下文。
- 对同一角色的不同称呼（如"大史"和"史强"），LLM 应识别为同一人。
- 若 LLM 未能自动去重，用户可在 Step 3 手动合并角色。
- 新出场角色标记 `isNew: true`，追加到项目的角色列表。
- 已有角色的 traits 可能在后续章节补充（增量更新，不覆盖）。

### 3.5 分析进度与错误处理

- 每完成一章分析，通过事件推送更新进度。
- 单章失败不阻塞后续章节（VS-PIPE-005）。
- 用户可在分析完成后对失败章节单独重试。
- 分析过程中用户可取消，已完成的章节结果保留。

### 3.6 逐字保真校验（Fidelity Gate）

在章节级 LLM 输出通过 JSON 解析后，必须执行以下校验与重锚定：

- 使用章节原文 `SourceChapter.rawText` 作为唯一文本真值。
- 对每个 segment 计算 `startOffset/endOffset`（0-based，左闭右开）。
- 将 segment.text 统一替换为 `rawText.slice(startOffset, endOffset)`。
- 对全章节做归一化比对：
  - `normalize(segments.map(s => s.text).join('')) === normalize(rawText)` 必须成立。
- 若无法安全对齐，章节分析记为失败并返回 `VS_TEXT_FIDELITY_MISMATCH`。

此门禁保证播放器展示文本与原文一致，避免 LLM 改写导致的错字/漏字/顺序漂移。

### 3.7 分析结果预览

分析进行中和完成后，UI 实时显示：
- 已分析章节数 / 总章节数
- 累计识别的角色列表（带段落计数）
- 最近生成的 segments 预览（带角色标签和类型标记）
