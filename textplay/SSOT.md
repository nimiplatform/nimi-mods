---
title: Nimi TextPlay Mod SSOT
status: ACTIVE
version: 2026-02-28
updated_at: 2026-02-28
rules:
  - TextPlay 业务执行真相唯一归属本文件；Mod 域仅可引用，不得重复定义本域规则。
  - TextPlay 是表现层（how to present），不得创造或改写叙事事实。
  - TextPlay 只消费 Narrative 的事实投影输入，不直连 Narrative 内部实现或私有数据结构。
  - 渲染主链固定 RenderInput -> normalize/filter -> buildPrompt -> generateText -> RenderOutput。
  - visibility 过滤与 POV 约束必须同时生效；任一失效都视为协议违规。
  - onRendered 等持久化回调失败不得阻断渲染主链返回（render path first）。
  - Presence 上报必须可驱动 Narrative Initiative，状态口径固定 composing|paused|active|idle|away。
  - 不做 legacy 字段映射层、不做双写、不做过渡壳接口。
  - 所有失败必须返回结构化 reasonCode + actionHint，并具备可观测性。
---

# Nimi TextPlay 唯一真相（SSOT）

## 1. Final-state 目标与边界

TextPlay 的目标是把 Narrative 产出的结构化事实渲染为高沉浸文本体验：

1. 接收标准化事实输入（RenderInput）。
2. 应用 POV/visibility/immersion 规则构建渲染 prompt。
3. 生成渲染文本并输出可观测元数据。
4. 可选持久化渲染轨迹（session/satellite）。

TextPlay 不负责：

1. 事实生成与一致性校验（归 Narrative）。
2. world/agent 维护写入（归 world-studio + realm）。
3. 镜头拆解、分镜与视频资产编排（归 videoplay）。

## 2. Manifest 与能力契约

### 2.1 Mod 身份（目标态）

1. modId: world.nimi.textplay
2. name: TextPlay
3. entry: ./dist/mods/textplay/index.js
4. kind: capability-mod

### 2.2 AI 能力

1. ai.consume: chat
2. 推荐调用面：@nimiplatform/sdk/mod/ai.generateText
3. route source 口径：local-runtime | token-api

### 2.3 数据与运行时能力（目标键）

LLM：

1. llm.text.generate

Data：

1. data.query.data-api.textplay.sessions.list
2. data.query.data-api.textplay.sessions.get
3. data.query.data-api.textplay.sessions.upsert
4. data.query.data-api.textplay.satellites.append
5. data.query.data-api.runtime.route.options

UI：

1. ui.register.ui-extension.app.sidebar.mods
2. ui.register.ui-extension.app.content.routes

## 3. 类型级输入/输出 Schema（冻结）

### 3.1 枚举与常量

1. TriggerSource = UserTurn | AgentInitiative | SystemEvent
2. Visibility = public | internal | sensory
3. PresenceState = composing | paused | active | idle | away

### 3.2 RenderableEvent

| 字段 | 类型 | 必填 | 默认 | 约束 |
|---|---|---|---|---|
| type | string | 是 | 无 | 非空 |
| payload | object | 是 | 无 | JSON object |
| visibility | enum(Visibility) | 否 | public | 非法值 fail-close |

### 3.3 RenderInput

| 字段 | 类型 | 必填 | 默认 | 约束 |
|---|---|---|---|---|
| events | RenderableEvent[] | 是 | 无 | 可空数组 |
| triggerSource | enum(TriggerSource) | 是 | 无 | 三态之一 |
| userMessage | string | 是 | 无 | 非空 |
| player | object | 是 | 无 | name/identity 必填 |
| scene | object \| null | 否 | null | name/description/location |
| agent | object \| null | 否 | null | name/identity/personality |
| worldStyle | object \| null | 否 | null | genre/tone/themes |
| metrics | object | 否 | {} | tension/significance 0~1 |

硬约束：

1. RenderInput 缺 player 或 userMessage 直接失败：TEXTPLAY_INPUT_INVALID。
2. visibility 非法值直接失败：TEXTPLAY_INPUT_INVALID。
3. TextPlay 输入事件必须来自 Narrative 的 CoreOutput 投影，不接受“直接写 prose”的旁路输入。

### 3.4 RenderOutput

| 字段 | 类型 | 必填 | 约束 |
|---|---|---|---|
| text | string | 是 | 非空 |
| meta.charCount | number | 是 | >= 1 |
| meta.model | string | 是 | 非空 |
| meta.latencyMs | number | 是 | >= 0 |

### 3.5 PresenceReport

| 字段 | 类型 | 必填 | 约束 |
|---|---|---|---|
| storyId | string | 是 | 非空 |
| state | enum(PresenceState) | 是 | 五态之一 |
| timestamp | string | 是 | ISO-8601 |

## 4. 渲染与 Presence 状态机（前置/后置条件冻结）

### 4.1 渲染主链状态机

| 阶段 | 前置条件 | 处理 | 后置条件 |
|---|---|---|---|
| RECEIVED | RenderInput 通过 schema 校验 | 生成 traceId | 进入 NORMALIZE |
| NORMALIZE | input 有效 | 默认值填充、字段规整 | 进入 FILTER_VISIBILITY |
| FILTER_VISIBILITY | events 已规整 | 过滤不可见 internal 事件 | 进入 BUILD_PROMPT |
| BUILD_PROMPT | 可见事件就绪 | 构建系统段 + 上下文段 + 触发段 + 事件段 | 进入 GENERATE |
| GENERATE | route 可用 | 调用 llm.generateText | 进入 WRAP_OUTPUT |
| WRAP_OUTPUT | 得到 text | 生成 RenderOutput/meta | 返回结果 |
| PERSIST_BEST_EFFORT | onRendered 存在 | 回调持久化 session/satellite | 失败仅告警 |

硬约束：

1. 任何失败不得返回“半结构”输出。
2. onRendered 失败不阻断主链，不改写 RenderOutput。

### 4.2 Presence 状态机

| 事件 | 前状态 | 后状态 | 备注 |
|---|---|---|---|
| onUserComposing | 任意 | composing | 触发上报 |
| onUserPaused | 任意 | paused | 触发上报 |
| onUserActive | 任意 | active | 触发上报并重置 idle 计时 |
| idle timeout 到达 | composing/paused/active | idle | 自动迁移 |
| away timeout 到达 | idle | away | 自动迁移 |
| onInitiativeReceived | 任意 | 原状态保持 | 仅重置 idle/away 计时 |

## 5. 核心算法伪代码（deterministic）

### 5.1 render

```text
function render(input, llm, config, onRendered):
  validateRenderInput(input)
  normalized = normalizeInput(input)
  visibleEvents = applyVisibilityFilter(normalized.events, normalized.player.name)
  prompt = buildPrompt({ ...normalized, events: visibleEvents }, config)

  text = llm.generateText(prompt)
  if text is empty:
    fail(TEXTPLAY_RENDER_EMPTY_RESPONSE)

  output = {
    text,
    meta: {
      charCount: text.length,
      model: llm.model,
      latencyMs: now - start,
    },
  }

  try onRendered(output, normalized, prompt)
  catch persistenceError:
    emitWarn(TEXTPLAY_PERSISTENCE_FAILED_WARN)

  return output
```

### 5.2 applyVisibilityFilter（POV fail-close）

```text
function applyVisibilityFilter(events, playerName):
  out = []
  for e in events:
    vis = e.visibility ?? public
    if vis in [public, sensory]:
      out.push(e)
      continue

    actor = e.payload.thinker ?? e.payload.decider ?? e.payload.experiencer ?? e.payload.owner
    if actor == playerName:
      out.push(e)
    else:
      continue

  return out
```

### 5.3 session presence timers

```text
function resetIdleChain(idleMs, awayMs):
  clear(idleTimer)
  clear(awayTimer)
  idleTimer = setTimeout(() => {
    setState(idle)
    awayTimer = setTimeout(() => setState(away), awayMs - idleMs)
  }, idleMs)
```

## 6. 与 Narrative 的协作契约

### 6.1 不跨模组耦合原则

1. TextPlay 不 import Narrative 内部代码。
2. 只通过调用方桥接消费 Narrative 输出。
3. RenderableEvent 是 spineEvents 的投影，不复制 Narrative 全对象。

### 6.2 标准桥接映射

1. CoreOutput.spineEvents[] -> RenderInput.events[]
2. CoreOutput.metrics -> RenderInput.metrics
3. TurnInput.userMessage -> RenderInput.userMessage
4. TurnInput.triggerSource -> RenderInput.triggerSource
5. player/scene/agent/worldStyle 由编排层补齐

### 6.3 NarrativeContext 投影消费约束

TextPlay 不直接读取 NarrativeContext 表，编排层投影需提供：

1. SUBJECT.narrativeSetting.dramaticRole
2. SUBJECT.narrativeState.activeObjective
3. SUBJECT.narrativeState.emotionalState
4. SUBJECT.narrativeState.pressure
5. RELATION.narrativeState.trust
6. RELATION.narrativeState.hostility
7. RELATION.narrativeState.volatility
8. RELATION.narrativeState.trend

规则：

1. 渲染层只消费投影，不回写 NarrativeContext。
2. 投影缺失允许降级，但必须返回 reasonCode + actionHint。
3. world/agent rules/lorebooks/events 正文由 Narrative Step1 编译，不在 TextPlay 层拼装。

## 7. Required Realm Contract（最小依赖）

TextPlay 原则上不直接依赖 realm 原始领域对象，依赖编排层摘要输入：

1. player：用户角色摘要
2. scene：当前场景锚点（可空）
3. agent：主交互主体摘要（可空）
4. worldStyle：世界风格摘要（可空）

编排层推荐映射：

1. worldStyle <- Worldview 叙事风格语义（含 visual/style 线索）
2. agent <- AgentProfile + NarrativeContext(scope=SUBJECT) 摘要
3. scene <- Narrative story 状态锚点 + world knowledge 投影
4. relationship cues <- NarrativeContext(scope=RELATION) 投影（先经 POV 过滤）

## 8. 失败语义：reasonCode -> actionHint（冻结映射）

| reasonCode | 触发条件 | 责任域 | actionHint（必须可执行） | 阻断 |
|---|---|---|---|---|
| TEXTPLAY_INPUT_INVALID | RenderInput 非法/缺关键字段 | orchestrator | 补齐 player/userMessage/events 并重试 | 是 |
| TEXTPLAY_ROUTE_UNAVAILABLE | 文本路由不可用 | runtime route | 切换可用 route source（local-runtime/token-api）后重试 | 是 |
| TEXTPLAY_PROMPT_BUILD_FAILED | prompt 构造异常 | textplay renderer | 修正输入字段与模板约束后重试 | 是 |
| TEXTPLAY_RENDER_EMPTY_RESPONSE | 模型返回空文本 | model/runtime | 切换模型或提高最小输出约束后重试 | 是 |
| TEXTPLAY_POV_VIOLATION_DETECTED | 输出包含玩家不可感知信息 | textplay renderer | 收紧 POV 约束并重新渲染 | 是 |
| TEXTPLAY_CONTEXT_MISSING_CRITICAL | scene/agent/worldStyle 关键摘要缺失 | context provider | 补齐关键上下文摘要后重试 | 是 |
| TEXTPLAY_PERSISTENCE_FAILED_WARN | session/satellite 持久化失败 | textplay data | 检查存储链路；不影响本次输出 | 否 |

## 9. Golden Cases（规范校验附件）

Golden Case 文件：

1. /Users/zhangkuan/Git/nimi-realm/nimi/nimi-mods/textplay/SSOT.golden.yaml

要求：

1. 实现与测试必须对齐 Golden Cases 的输入、过滤行为与输出约束。
2. 若变更 Golden Cases，必须同步更新本 SSOT 对应条款。
3. 禁止新增“仅代码行为、无 SSOT 条款支撑”的 case。

## 10. 验收门禁（必须全部满足）

1. 文本输出不引入 RenderInput.events 之外的新事实。
2. visibility 过滤与 POV 规则同时通过。
3. triggerSource 三态行为差异可测且稳定。
4. 持久化失败时渲染仍正常返回。
5. Presence 状态转换与上报符合状态机定义。
6. 失败路径返回 reasonCode + actionHint。
7. Golden Cases 全量通过。

## 11. 与其他 SSOT 对齐

1. Narrative 事实层契约：@nimiplatform/nimi-mods/narrative/SSOT.md
2. world 边界词汇：@nimiplatform/nimi/ssot/boundaries/world.md
3. agent 边界词汇：@nimiplatform/nimi/ssot/boundaries/agent.md
4. mod 通用治理规则：@nimiplatform/nimi/ssot/mod/governance.md
5. 跨 mod 编排契约：@nimiplatform/nimi/ssot/mod/worldstudio-narrative-rendering.md

## 12. 设计锚点（实现来源）

1. 旧项目 textplay 渲染主链锚点：/Users/zhangkuan/Git/nimi/mods/textplay/src/engine/renderer.ts
2. 旧项目 prompt 构造与 visibility 过滤锚点：/Users/zhangkuan/Git/nimi/mods/textplay/src/engine/prompt-builder.ts
3. 旧项目 presence/session 行为锚点：/Users/zhangkuan/Git/nimi/mods/textplay/src/engine/session.ts
4. 旧项目 textplay 设计文档锚点：/Users/zhangkuan/Git/nimi/.openclaw/sakura/discussions/textplay-mod.md
5. 新项目 mod 开发规范锚点：/Users/zhangkuan/Git/nimi-realm/nimi/nimi-mods/AGENTS.md、/Users/zhangkuan/Git/nimi-realm/nimi/ssot/mod/governance.md
