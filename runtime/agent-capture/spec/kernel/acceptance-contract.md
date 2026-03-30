# Agent-Capture 验收契约

> Rule ID 前缀: `AC-ACC-*`
> 验收用例事实源: [`tables/acceptance-cases.yaml`](tables/acceptance-cases.yaml)

---

## AC-ACC-001 — Draft-first 创建验收门

**覆盖用例**: AC-001 ~ AC-003

**验收条件**:
- 首次有效输入时隐式创建 `AgentDraft`
- 输入本身不自动触发 `Generate Agent`
- 一次 `Generate Agent` 只产出一个当前 `generatedImage`

## AC-ACC-002 — 对话式捕捉验收门

**覆盖用例**: AC-004、AC-005、AC-025、AC-026

**验收条件**:
- 角色收敛通过 feeling-led 对话进行，而不是调查问卷式固定字段收集
- 参考图与 selected existing agent 为可选辅助上下文；留空不阻塞生成
- 对话默认优先把角色落实到人物主体、服装、材质、配饰、手持道具与画风，而不是把大篇幅轮次花在背景讨论上
- prompt shell 与 LLM 输出语言应跟随 desktop 当前系统语言；仅 `zh*` 使用中文，其余语言统一回落为英文

## AC-ACC-003 — Brief 确认与上下文优先级验收门

**覆盖用例**: AC-012 ~ AC-023、AC-027、AC-028、AC-029

**验收条件**:
- 点击 `Generate Agent` 后，系统先在主会话流中输出 brief 确认消息
- 用户不直接编辑 brief，而是通过继续对话修正系统理解
- selected existing agent 仅作为辅助上下文，当前用户输入始终优先
- existing agent 上下文变化后，当前 brief 会重新计算
- 当前用户输入指当前会话中仍然有效的用户意图集合，而不是只看最后一句消息
- existing agent 背景读取必须走已声明的 SDK/host data query surface
- 每次生成都基于当前 feeling anchor + state bundle，而不是机械重放完整原始历史
- feeling anchor 必须能稳定承接当前角色感觉，而不是把角色感觉只留在原始对话历史里
- 当前结果若仍有偏差，默认通过继续对话形成下一版 brief 来纠偏，而不是在当前生成后隐式追加自动纠偏
- 当前结果形成后，必须伴随轻量角色读取文本

## AC-ACC-004 — Draft 整理、替换与结果 framing 验收门

**覆盖用例**: AC-006、AC-007、AC-008、AC-024

**验收条件**:
- `Regenerate` 直接替换当前结果
- `name`、`bio`、`tags` 可编辑且不自动触发重生成
- `personaSeed` 不作为第一版直接手改字段
- 默认正式图像结果采用固定焦距倾向的全身角色锚点图 framing，而不是夸张透视或剧情化镜头
- 默认正式图像结果应稳定落实人物主体上的服装、材质、配饰、手持道具与画风，而不是由背景场景主导阅读重心

## AC-ACC-005 — Handoff 与清理验收门

**覆盖用例**: AC-009、AC-010、AC-011

**验收条件**:
- 保存 draft 不自动触发 handoff
- handoff 失败不得破坏本地 draft
- 空 draft 仅在当前上下文中临时保留，离开后自动删除
