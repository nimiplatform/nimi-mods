# Pipeline Contract

> Owner Domain: `VS-PIPE-*`
> Authoritative fact source: `tables/project-states.yaml`

本合约定义 Voice Studio 的五步流水线及其状态转换规则。

---

## VS-PIPE-001 — 五步流水线

Voice Studio 的用户流程为严格有序的五个阶段：

| Step | 阶段 | 入口条件 | 产出 |
|------|------|---------|------|
| 1 | 导入文本 (Import) | 无 | SourceChapter[] |
| 2 | AI 分析 (Analyze) | SourceChapter 非空 | Script + CharacterProfile[] |
| 3 | 声线分配 (Cast) | Script 存在 + CharacterProfile[] 存在 | VoiceCasting（全部主要/次要角色已分配） |
| 4 | 批量合成 (Synthesize) | 全部非低频角色已分配声线 | SegmentJob[] 全部 done |
| 5 | 播放 (Play) | 至少一个章节的全部 segment 合成完成 | — |

## VS-PIPE-002 — 状态转换规则

项目状态严格遵循 `tables/project-states.yaml` 的状态机定义。

- 前进：完成当前阶段的全部必要产出后，可进入下一阶段。
- 回退：用户可从任意阶段回退到之前的阶段，但需接受回退影响：
  - Step 3 → Step 2 (重新分析): 清空 Script、CharacterProfile、VoiceCasting、SynthesisJob。
  - Step 4 → Step 3 (修改声线): 仅清空受影响角色的 SegmentJob（已合成的其他角色保留）。
  - Step 5 → Step 3 (修改声线): 同上。
  - Step 5 → Step 4 (重试失败): 仅重新执行 failed 状态的 SegmentJob。
- 不允许跳过阶段。

## VS-PIPE-003 — 断点续传

- 项目在任意阶段均可保存退出。
- 下次打开项目时，恢复到上次的阶段和进度。
- Step 2 (分析中) 中断后重开：从上次完成的最后一个章节继续分析。
- Step 4 (合成中) 中断后重开：从 pending/failed 的 SegmentJob 继续合成。

## VS-PIPE-004 — Step 1 文本导入规则

- 支持的输入方式：
  - 文本粘贴（textarea）
  - 文件上传（`<input type="file" accept=".txt">`，浏览器 File API）
- 章节自动检测正则模式（按优先级）：
  1. `/^第[一二三四五六七八九十百千\d]+[章节回卷篇部]/m` （中文章节/卷/篇/部）
  2. `/^(?:Chapter|Part|Prologue|Epilogue)\s+[\d]+/mi` （英文章节）
  3. `/^CHAPTER\s+[IVXLC\d]+/mi` （罗马数字章节）
  4. 无匹配时，全文作为单章节
- 用户可手动调整章节分割点。
- 导入完成后显示统计信息：章节数、总字数。

## VS-PIPE-005 — Step 2 AI 分析规则

- 分析以**章节**为单位，逐章调用 LLM。
- 每次调用传入：
  - 当前章节全文
  - 前文已识别的角色列表（上下文记忆）
  - 前一章最后 2-3 个 segment（保持连贯性）
- LLM 输出结构化 JSON（通过 `aiClient.generateObject()` + Zod schema 约束）。
- 分析产物：
  - `ScriptSegment[]`: 该章节的全部段落
  - `CharacterProfile[]` 增量更新: 新出场角色追加，已有角色 traits 可能补充
- 章节分析完成后必须执行文本保真校验（fidelity gate）：
  - 将 segment 序列重锚定到 `SourceChapter.rawText`，生成每个 segment 的 `startOffset/endOffset`。
  - 校验 `segments.map(text).join('')` 与章节原文在归一化规则下完全一致。
  - 若无法安全对齐，章节标记失败并记录 `VS_TEXT_FIDELITY_MISMATCH`。
- 分析进度通过 `hook.event.publish` 推送，UI 实时更新。
- 单章分析失败时，记录错误并跳过，不阻塞后续章节。用户可稍后对失败章节单独重试。

## VS-PIPE-006 — Step 3 声线分配规则

- 角色按 `tables/character-tiers.yaml` 自动分级。
- AI 自动推荐（第一版）：
  - LLM 读取角色 traits + 可用预设声线列表 → 输出推荐的 voiceId。
  - 用户可手动覆盖任何推荐。
- AI 自动推荐（后续 Voice Design 版本）：
  - 从角色 traits 生成 voice design prompt → 调用 Voice Design API → 拿到 designedVoiceId。
- 低频角色自动分配规则：
  - male → 默认男声预设
  - female → 默认女声预设
  - neutral → 默认中性预设
- 进入 Step 4 的前提：全部非低频角色已分配声线。
- 试听：选择该角色的一句代表性台词，调用 `hook.llm.speech.synthesize()` 即时生成。

## VS-PIPE-007 — Step 5 播放规则

- 播放器采用 segment 队列模式：逐段播放，段间无缝衔接。
- 文本跟读同步：
  - 当前播放 segment 高亮显示，自动滚动。
  - 对话段落显示角色名标签 + 角色专属颜色。
  - 旁白段落无角色标签。
- 交互：
  - 点击任意段落文本 → 跳转到该段落播放。
  - 进度条拖动 → 定位到对应段落。
  - 章节切换 → 跳转到目标章节的第一个 segment。
- 播放可在 Step 4 合成尚未全部完成时开始（Step 5 入口条件：至少一个章节完整）。
