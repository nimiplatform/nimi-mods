---
title: Nimi Narrative Mod SSOT
status: ACTIVE
version: 2026-02-28
updated_at: 2026-02-28
rules:
  - Narrative 业务执行真相唯一归属本文件；Mod 域仅可引用，不得重复定义本域规则。
  - Narrative 是叙事事实层（what happened），只产出结构化事实，不产出文本/镜头渲染结果。
  - Narrative 主链固定为 step0(intent) -> step1(assembly) -> step2(generate) -> step3(guard) -> spine write。
  - Narrative 必须保持触发中立：UserTurn | AgentInitiative | SystemEvent。
  - CoreOutput 顶层字段白名单固定 spineEvents/stateChanges/metrics，禁止表现层字段回流。
  - spineEvents.visibility 枚举固定为 public|internal|sensory，缺失按 public 处理，非法值必须 fail-close。
  - Step1 世界上下文装配固定 2a provider -> extractKeywords -> 2b consumer，禁止无边界全量注入。
  - Narrative 读取 world+agent 语义必须通过 realm 稳定边界，不得耦合 legacy forge 专表。
  - NarrativeContext 作用域固定 CANON|STORY|SUBJECT|RELATION，仅承载叙事控制变量；不得持久化 world/agent 事实正文。
  - 不做 legacy 字段映射层、不做双写、不做过渡壳接口。
  - 所有失败必须返回结构化 reasonCode + actionHint，并可审计重放。
---

# Nimi Narrative 唯一真相（SSOT）

## 1. Final-state 目标与边界

Narrative 的目标是在 mod 层提供统一叙事事实引擎，稳定承载：

1. 多触发源回合处理（用户输入、角色主动推进、系统事件）。
2. world+agent 上下文编译（结构化装配，不做渲染）。
3. 事实级输出（CoreOutput）与一致性守卫（CheckResult）。
4. 叙事事实持久化（Spine append-only）与可追溯审计。

Narrative 不负责：

1. 文本渲染、UI 表现、镜头脚本生成（归 textplay / videoplay）。
2. World 编辑与发布（归 world-studio + realm world control-plane）。
3. Agent 记忆策略与召回算法细节（归 realm agent domain）。

## 2. Manifest 与能力契约

### 2.1 Mod 身份（目标态）

1. modId: world.nimi.narrative
2. name: Narrative
3. entry: ./dist/mods/narrative/index.js
4. kind: capability-mod

### 2.2 AI 能力

1. ai.consume: chat
2. 推荐调用面：@nimiplatform/sdk/mod/ai.generateObject（结构化 JSON 输出）
3. route source 口径：local-runtime | token-api

### 2.3 数据与运行时能力（目标键）

LLM：

1. llm.text.generate
2. llm.text.stream（可选，仅调试/可视化）

Data（Narrative 自身）：

1. data.query.data-api.narrative.story.ensure
2. data.query.data-api.narrative.story.get
3. data.query.data-api.narrative.story.update-state
4. data.query.data-api.narrative.spine.append-events
5. data.query.data-api.narrative.spine.recent-events
6. data.query.data-api.narrative.spine.recall
7. data.query.data-api.narrative.spine.update-causal-links

Data（跨域读）：

1. data.query.data-api.world.maintenance.get
2. data.query.data-api.world.events.list
3. data.query.data-api.world.lorebooks.list
4. data.query.data-api.world.mutations.list
5. data.query.data-api.agent.profile.get
6. data.query.data-api.agent.memory.core
7. data.query.data-api.agent.memory.events
8. data.query.data-api.runtime.route.options

## 3. 类型级输入/输出 Schema（冻结）

### 3.1 枚举与常量

1. TriggerSource = UserTurn | AgentInitiative | SystemEvent
2. NarrativeMode = normal | retrospective_collapse | timeskip
3. ModelRoute = lite | pro
4. CheckStatus = APPROVED | ADJUSTED | REJECTED
5. Visibility = public | internal | sensory
6. NarrativeContextScope = CANON | STORY | SUBJECT | RELATION

### 3.2 TurnInput

| 字段 | 类型 | 必填 | 默认 | 约束 |
|---|---|---|---|---|
| storyId | string | 是 | 无 | 非空 |
| triggerSource | enum(TriggerSource) | 是 | 无 | 三态之一 |
| userMessage | string | 条件 | 无 | UserTurn 时必填且非空；其他触发可空 |
| systemPayload | object | 否 | {} | JSON object |

硬约束：

1. storyId 非法直接失败：NARRATIVE_INPUT_INVALID。
2. UserTurn 缺失 userMessage 直接失败：NARRATIVE_INPUT_INVALID。
3. triggerSource 非法直接失败：NARRATIVE_INPUT_INVALID。

### 3.3 NarrativeContextSnapshot（Step1 运行时编译产物）

该对象是 Step1 的运行时编译快照，不是持久化实体。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| place | object | 是 | 当前叙事锚点（由 story 状态 + world 资产派生） |
| worldviewRules | object | 是 | Worldview + 常驻 lorebook 常量规则编译结果 |
| sceneMaterial | object | 是 | 事件/知识素材池（冲突、威胁、机会、待决线索） |
| availableActors | array | 是 | 当前可交互主体摘要 |
| narrativeStyle | object | 是 | 叙事风格语义（genre/tone/themes/visual cues） |
| characterRelations | array | 是 | 当前关系投影（结构源优先） |
| futureEvents | array | 否 | 仅作者侧暗线，禁止直接剧透玩家 |
| narrativeContextScopes | object | 是 | CANON -> STORY -> SUBJECT -> RELATION 叠加快照 |

### 3.4 AssemblyBundle

| 字段 | 类型 | 必填 | 默认 | 约束 |
|---|---|---|---|---|
| mode | enum(NarrativeMode) | 是 | normal | 由 step0 + story 状态决定 |
| modelRoute | enum(ModelRoute) | 是 | pro | 由 mode/策略路由决定 |
| userMessage | string | 是 | "" | 非 UserTurn 可为空串 |
| intentSignal | object | 是 | 无 | 包含 type/direction |
| context | object | 是 | 无 | world/agent/storyState/spineHistory |
| hardConstraints | object | 是 | 无 | platform/world/identity/canon |
| softHints | array | 否 | [] | 仅建议，不可突破硬约束 |
| gravitySignals | array | 否 | [] | 张力/推进信号 |
| compiledPrompt.step2Prompt | string | 是 | 无 | 非空 |
| promptPolicyVersion | string | 是 | 无 | 非空 |
| spineEventCountRules | object | 是 | 无 | 每 mode 的 min/max |

### 3.5 CoreOutput

| 字段 | 类型 | 必填 | 默认 | 约束 |
|---|---|---|---|---|
| spineEvents | array | 是 | 无 | 长度受 mode 规则约束 |
| spineEvents[].type | string | 是 | 无 | 必须为受支持 SpineNodeType |
| spineEvents[].payload | object | 是 | 无 | 非空 object |
| spineEvents[].visibility | enum(Visibility) | 否 | public | 非法值 fail-close |
| stateChanges | object | 是 | {} | 仅事实态变更，不含表现态 |
| metrics | object | 是 | {} | tension/significance 范围 0~1 |

硬约束：

1. CoreOutput 顶层仅允许 spineEvents/stateChanges/metrics。
2. tension/significance 出界直接失败：NARRATIVE_GENERATION_SCHEMA_INVALID。
3. spineEvents 数量不满足规则时：过少 REJECTED，过多 ADJUSTED（截断到 max）。

### 3.6 CheckResult 与 TurnResult

CheckResult：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| status | enum(CheckStatus) | 是 | APPROVED/ADJUSTED/REJECTED |
| adjustedOutput | CoreOutput | 条件 | status=ADJUSTED 时必填 |
| reasonCode | string | 条件 | ADJUSTED/REJECTED 时必填 |
| actionHint | string | 条件 | ADJUSTED/REJECTED 时必填 |
| checkerTrace | string[] | 是 | 守卫轨迹 |
| requestId | string | 是 | 审计可追踪 |
| policyVersion | string | 是 | 与 bundle 对齐 |

TurnResult：

1. 成功：{ ok: true, output: CoreOutput, check: CheckResult }
2. 失败：{ ok: false, check: CheckResult }

## 4. 执行状态机（前置/后置条件冻结）

| 阶段 | 前置条件 | 处理 | 后置条件 |
|---|---|---|---|
| RECEIVED | TurnInput 通过 schema 校验 | 记录 traceId/requestId | 进入 STEP0 |
| STEP0_INTENT | story 存在且可访问 | 解析 intent/mode 候选 | 进入 STEP1 |
| STEP1_ASSEMBLY | world+agent 读面可用 | 编译 AssemblyBundle + prompt | 进入 STEP2 |
| STEP2_GENERATE | modelRoute 可用 | 生成 CoreOutput | 进入 STEP3 |
| STEP3_GUARD | CoreOutput 非空 | schema/count/safety guard | APPROVED/ADJUSTED/REJECTED |
| WRITE_SPINE | status in APPROVED/ADJUSTED | append events + update state + causal enrich(best-effort) | 返回 ok=true |
| REJECT_TERMINAL | status=REJECTED | 禁止写入 spine | 返回 ok=false |

硬约束：

1. REJECTED 绝不写 spine。
2. ADJUSTED 必须写 adjustedOutput，不得写原始 output。
3. causal enrichment 失败只记警告，不得回滚已落盘事实。

## 5. 核心算法伪代码（deterministic）

### 5.1 processTurn

```text
function processTurn(input):
  validateTurnInput(input)
  story = story.ensure(input.storyId)
  intent = step0.parseIntent(input, story)
  bundle = step1.assemble(intent, input, realmReaders)
  raw = step2.generateObject(bundle)
  check = step3.guard(raw, bundle)

  if check.status == REJECTED:
    audit(check)
    return { ok: false, check }

  finalOutput = (check.status == ADJUSTED) ? check.adjustedOutput : raw
  writeSpine(story.id, finalOutput, input.triggerSource)
  audit(check)
  return { ok: true, output: finalOutput, check }
```

### 5.2 step0.parseIntent

```text
function parseIntent(input, storyState):
  if input.triggerSource == UserTurn and empty(input.userMessage):
    fail(NARRATIVE_INPUT_INVALID)

  intentType = classifyIntentType(input.userMessage, input.systemPayload)  // TEXT|CHOICE|ACTION|SYSTEM
  direction = classifyDirection(input.userMessage, storyState.activeObjective)  // aligned|opposed|unrelated
  hasTimeGap = detectTimeGapCue(input.userMessage, input.systemPayload)

  mode = normal
  if hasTimeGap: mode = timeskip
  if shouldRetrospectiveCollapse(storyState): mode = retrospective_collapse

  return { intentType, direction, hasTimeGap, mode }
```

### 5.3 step1.assembleAndCompile

```text
function assembleAndCompile(intent, input, storyId, worldId, subjectSet, relationSet):
  worldFacts = readWorldview + readWorldEvents + readWorldLorebooks
  agentFacts = readAgentProfiles + readAgentMemories + readAgentRules + readAgentLorebooks
  scopeStack = loadNarrativeContexts(CANON, STORY, SUBJECT, RELATION)

  merged = overlay(CANON, STORY, SUBJECT, RELATION, conflictPolicy)
  place = derivePlaceFromStoryAnchor(storyId, worldFacts)
  sceneMaterial = buildMaterialPool(worldFacts.events, worldFacts.lorebooks, agentFacts.memories)
  availableActors = deriveAvailableActors(subjectSet, relationSet, agentFacts)

  snapshot = {
    place,
    worldviewRules: compileWorldviewRules(worldFacts),
    sceneMaterial,
    availableActors,
    narrativeStyle: deriveNarrativeStyle(worldFacts.worldview),
    characterRelations: deriveRelations(relationSet, merged),
    futureEvents: authorOnly(worldFacts.events where eventHorizon == FUTURE),
    narrativeContextScopes: merged,
  }

  hardConstraints = compileHardConstraints(worldFacts, agentFacts, snapshot)
  softHints = compileSoftHints(snapshot, storyId)
  mode = intent.mode
  modelRoute = selectModelRoute(mode, storyRuntimeLoad, routeOptions)
  prompt = buildStep2Prompt(input, intent, snapshot, hardConstraints, softHints)

  return AssemblyBundle(mode, modelRoute, snapshot, hardConstraints, softHints, prompt)
```

### 5.4 step2.generateCoreOutput

```text
function generateCoreOutput(bundle):
  raw = llm.generateObject(schema=CoreOutputSchema, prompt=bundle.compiledPrompt.step2Prompt, route=bundle.modelRoute)
  return raw
```

### 5.5 step3.guard

```text
function guard(raw, bundle):
  if !validateTopLevelKeys(raw, allowed=[spineEvents, stateChanges, metrics]):
    return reject(NARRATIVE_GENERATION_SCHEMA_INVALID)

  if !validateSpineEventCount(raw.spineEvents, bundle.spineEventCountRules[bundle.mode]):
    if count(raw.spineEvents) < minRule: return reject(NARRATIVE_EVENT_COUNT_UNDERFLOW)
    if count(raw.spineEvents) > maxRule:
      adjusted = truncate(raw.spineEvents, maxRule)
      return adjust(adjusted, NARRATIVE_EVENT_COUNT_OVERFLOW_ADJUSTED)

  for e in raw.spineEvents:
    if !isValidSpineNodeType(e.type): return reject(NARRATIVE_GENERATION_SCHEMA_INVALID)
    if !isNonEmptyObject(e.payload): return reject(NARRATIVE_GENERATION_SCHEMA_INVALID)
    if !isValidVisibility(e.visibility ?? public): return reject(NARRATIVE_VISIBILITY_INVALID)

  if !inRange(raw.metrics.tension, 0, 1): return reject(NARRATIVE_GENERATION_SCHEMA_INVALID)
  if !inRange(raw.metrics.significance, 0, 1): return reject(NARRATIVE_GENERATION_SCHEMA_INVALID)

  return approve(raw)
```

### 5.6 writeSpine

```text
function writeSpine(storyId, finalOutput, triggerSource):
  spine = spineRepo.findByStoryId(storyId)
  if !spine: fail(NARRATIVE_SPINE_WRITE_CONFLICT)

  source = mapTriggerSource(triggerSource)  // USER_TURN|AGENT_INITIATIVE|SYSTEM
  appendAllEventsTransaction(spine.id, finalOutput.spineEvents, source)

  if notEmpty(finalOutput.stateChanges):
    storyRepo.updateState(storyId, finalOutput.stateChanges)

  try:
    enrichAndWriteCausalLinks(spine.id, recentLimit=20)
  catch:
    warn(causal_enrichment_failed)  // best-effort only
```

### 5.7 initiative.tick

```text
function initiativeTick(storyId, presence, cooldowns, consecutiveCount):
  if presence in [composing, active]: return NOOP
  if consecutiveCount >= maxConsecutiveInitiatives: return NOOP

  for rule in rulesByPriority:
    if inCooldown(rule, storyId): continue
    if !rule.condition(storyRuntimeState): continue

    fire triggerSource = (rule.kind == away_world_advance) ? SystemEvent : AgentInitiative
    result = processTurn({ storyId, triggerSource, userMessage: rule.syntheticMessage })
    markCooldown(rule, storyId)
    bumpConsecutive(storyId)
    return result

  return NOOP
```

## 6. Required Realm Contract（与 world+agent 对齐）

### 6.1 必需读取面

World 侧：

1. Worldview.coreSystem/hardRules/narrativeHooks
2. WorldEvent（含 eventHorizon=PAST|ONGOING|FUTURE）
3. WorldLorebook（constant/enabled/validFrom/validTo）
4. WorldMutation（审计/维护线索）

Agent 侧：

1. AgentProfile（identity/ownership/world binding）
2. AgentProfile.dna（先天人格层）
3. AgentMemory（core/events）
4. AgentUserProfile（agent-user 私有画像）
5. Agent 规则与 lorebook 资产（运行时读取并编译）

Narrative 侧：

1. NarrativeSpine（append-only）
2. NarrativeContext（scope=CANON|STORY|SUBJECT|RELATION）

### 6.2 NarrativeContext 正式字段契约（冻结）

共享壳层：

1. worldId: string
2. storyId: string | null（CANON 可空）
3. scope: CANON | STORY | SUBJECT | RELATION
4. scopeKey: string（唯一键）
5. subjectType/subjectId: string | null
6. targetSubjectType/targetSubjectId: string | null
7. narrativeSetting: object（稳定叙事设定）
8. narrativeState: object（运行态索引；CANON 强制 {}）
9. derivedFromSpineSeq: number（上下文基线序号）

scope 语义：

1. CANON：揭示策略/剧透策略/节奏策略/主动推进策略。
2. STORY：叙事弧契约、POV 策略、角色表策略、阶段张力与未决线程。
3. SUBJECT：主体长期目标与行为倾向、当前目标与情绪/压力/冷却态。
4. RELATION：关系契约与披露策略、信任/敌意/依赖/亲密/波动趋势。

禁止项（硬约束）：

1. 不在 NarrativeContext 持久化 Worldview 规则正文。
2. 不在 NarrativeContext 持久化 WorldLorebook/AgentLorebook 正文。
3. 不在 NarrativeContext 持久化 WorldEvent 事实正文。

## 7. 失败语义：reasonCode -> actionHint（冻结映射）

| reasonCode | 触发条件 | 责任域 | actionHint（必须可执行） | 阻断 |
|---|---|---|---|---|
| NARRATIVE_INPUT_INVALID | TurnInput 字段非法/缺失 | orchestrator | 修正 storyId/triggerSource/userMessage 后重试 | 是 |
| NARRATIVE_STORY_NOT_FOUND | storyId 无对应 story | narrative-data | 先创建或恢复 story session，再重试 | 是 |
| NARRATIVE_CONTEXT_INSUFFICIENT | Step1 缺关键上下文 | world/agent provider | 补齐 CANON/STORY/SUBJECT/RELATION 必需投影后重试 | 是 |
| NARRATIVE_ROUTE_UNAVAILABLE | modelRoute 不可用 | runtime route | 切换可用 route source（local-runtime/token-api）后重试 | 是 |
| NARRATIVE_GENERATION_SCHEMA_INVALID | CoreOutput schema/safety 不通过 | narrative-step2/3 | 修正生成 schema 约束并重试 | 是 |
| NARRATIVE_EVENT_COUNT_UNDERFLOW | 事件数 < mode.min | narrative-step2 | 提升事件生成密度后重试 | 是 |
| NARRATIVE_EVENT_COUNT_OVERFLOW_ADJUSTED | 事件数 > mode.max | narrative-step3 | 已自动截断；检查上游生成提示词 | 否 |
| NARRATIVE_VISIBILITY_INVALID | visibility 非法值 | narrative-step3 | 修正事件 visibility 到 public/internal/sensory | 是 |
| NARRATIVE_CANON_CONFLICT | 与硬规则冲突 | world/narrative compile | 修正冲突规则或切换剧情方向 | 是 |
| NARRATIVE_SPINE_WRITE_CONFLICT | spine 写入冲突/并发竞争 | narrative-data | 重试写入并保持同 idempotencyKey | 是 |
| NARRATIVE_INITIATIVE_COOLDOWN_ACTIVE | 主动规则处于冷却 | initiative engine | 等待冷却结束或用户触发后重试 | 否 |

## 8. Golden Cases（规范校验附件）

Golden Case 文件：

1. /Users/zhangkuan/Git/nimi-realm/nimi/nimi-mods/narrative/SSOT.golden.yaml

要求：

1. 实现与测试必须对齐 Golden Cases 的输入、输出与写入副作用。
2. 若变更 Golden Cases，必须同步更新本 SSOT 对应条款。
3. 禁止新增“仅代码行为、无 SSOT 条款支撑”的 case。

## 9. 验收门禁（必须全部满足）

1. Narrative 输出只包含 CoreOutput 白名单字段。
2. spineEvents.visibility 全量合法，且可被 textplay 过滤链消费。
3. 同一输入在 Step1 装配层具备可重放性（关键词提取与约束编译可追踪）。
4. REJECTED 不写 spine；ADJUSTED 写入修正结果。
5. Presence 驱动 Initiative 满足 cooldown 和连续触发上限。
6. 所有失败返回 reasonCode + actionHint，并落审计事件。
7. Golden Cases 全量通过。

## 10. 与其他 SSOT 对齐

1. world 边界词汇与责任分割：@nimiplatform/nimi/ssot/boundaries/world.md
2. agent 边界词汇与责任分割：@nimiplatform/nimi/ssot/boundaries/agent.md
3. mod 通用治理规则：@nimiplatform/nimi/ssot/mod/governance.md
4. world 创作侧语义来源：@nimiplatform/nimi-mods/world-studio/SSOT.md
5. text 渲染层消费契约：@nimiplatform/nimi-mods/textplay/SSOT.md
6. 跨 mod 编排契约：@nimiplatform/nimi/ssot/mod/worldstudio-narrative-rendering.md

## 11. 设计锚点（实现来源）

1. 旧项目 narrative 功能主链锚点：/Users/zhangkuan/Git/nimi/mods/narrative/src/engine/pipeline.ts
2. 旧项目 Step1 编译与 guard 行为锚点：/Users/zhangkuan/Git/nimi/mods/narrative/src/engine/step1-assembly.ts、/Users/zhangkuan/Git/nimi/mods/narrative/src/engine/step3-guard.ts
3. 旧项目 Initiative 行为锚点：/Users/zhangkuan/Git/nimi/mods/narrative/src/engine/initiative.engine.ts
4. 旧项目 narrative 设计文档锚点：/Users/zhangkuan/Git/nimi/.openclaw/sakura/discussions/narrative-mod.md
5. 新项目 mod 开发规范锚点：/Users/zhangkuan/Git/nimi-realm/nimi/nimi-mods/AGENTS.md、/Users/zhangkuan/Git/nimi-realm/nimi/ssot/mod/governance.md
