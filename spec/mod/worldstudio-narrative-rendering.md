# World Studio -> Narrative-Engine -> Rendering Chain Domain Spec

> Status: Draft
> Date: 2026-03-02
> Scope: 跨 mod 编排契约，定义链路边界与域增量。

## 1. 目标与范围

本文件约束三层协作：

1. `world-studio`：生产世界知识资产（World/Worldview/Events/Lorebooks）。
2. `narrative-engine`：把世界资产 + agent 关系连续性编译成回合事实。
3. `renderer`：把事实投影渲染为用户可消费内容（文本或视频）。

本文件不定义：

1. 各 mod 内部实现细节（见各自 spec）。
2. realm 私有治理算法。

### 1.2 Contract-First 解释

1. 本文件定义的是链路合同，不是“已上线实现清单”。
2. 任何 stage 在实现前都必须先满足对应 spec 的规则、表源和验证命令。
3. 禁止以临时运行行为反向定义 spec；实现必须追随 spec，而不是相反。

### 1.1 双视角链路（人类与 AI 共读）

#### 1.1.1 架构主链（系统内部契约）

1. `world-studio -> narrative-engine -> renderer(textplay|videoplay)`。
2. `narrative-engine` 负责事实编译与守卫，不直接作为玩家 UI 入口。
3. `renderer` 只消费 `CoreOutput` 投影，不回写叙事事实层。

#### 1.1.2 玩家体验链（产品交互主路径）

1. Creator 在 `world-studio` 建立并发布世界资产（World/Worldview/Events/Lorebooks）。
2. 玩家在 `textplay` 实时游玩并与角色/世界互动。
3. 玩家交互触发 narrative turn，系统持续生成并沉淀 canonical `CoreOutput + spine`。
4. 玩家进入 `videoplay`，对已形成的叙事事实窗口做分集化生产。
5. `videoplay` 产出可发布的 `Episode ReleasePackage`（video+poster+caption+metadata+trace）。

## 2. 固定阶段与职责

### Stage A: world-studio（创作与维护）

输入：

1. Creator 素材输入
2. WorldAccessControl
3. AI route 配置

输出（发布后）：

1. `World + Worldview`
2. `WorldEvent[]`（PRIMARY/SECONDARY）
3. `WorldLorebook[]`
4. `WorldMutation[]`（审计流）

### Stage B: narrative-engine（事实生成）

输入：

1. `TurnInput`（storyId + triggerSource + message/systemPayload）
2. 回合触发源来自 textplay 玩家互动、agent initiative 或 system event（统一进入 narrative-engine 编译链）。
3. Stage A 产出的 world 资产（读）
4. agent 语义资产（profile + memory + NarrativeContext(setting/state)）

输出：

1. `TurnResult`
2. 成功态中的 `CoreOutput`
3. spine append-only 事实写入与审计

NarrativeContext 正式 scope 字段：

1. `CANON`：`revealPolicy/spoilerPolicy/pacingPolicy/initiativePolicy`
2. `STORY`：`arcContract/povPolicy/castPolicy + phase/tension/openThreads`
3. `SUBJECT`：`dramaticRole/longTermObjective/hiddenAgenda/decisionPolicy + activeObjective/emotionalState/pressure`
4. `RELATION`：`relationContract/disclosurePolicy + trust/hostility/dependency/intimacy/trend`

### Stage C: renderer（表现输出）

可选分支：

1. `textplay`：输出沉浸文本
2. `videoplay`：输出分集短剧发布包（master video + poster + caption + metadata + trace）

硬约束：

1. renderer 只能读取 `CoreOutput` 投影。
2. renderer 不能写入 narrative-engine spine。

## 3. 统一事实接口（跨 text/video）

### 3.1 Canonical Fact Payload

1. `CoreOutput.spineEvents[]`
2. `CoreOutput.stateChanges`
3. `CoreOutput.metrics`

### 3.2 Renderer Input Projection

所有 renderer 必须从 `CoreOutput` 派生本模态输入，至少包含：

1. `events`（来自 `spineEvents`）
2. `triggerSource`
3. `userMessage/systemContext`
4. `worldStyle`
5. `agent/player/scene anchor`
6. `metrics`
7. `sourceEventIds`（渲染计划中每个 beat/shot 的事实追溯键）

## 4. TextPlay 与 VideoPlay 分工

### 4.1 TextPlay（正式）

1. 输出文本散文/对话体验。
2. 强制执行 visibility + POV 约束。
3. 固定执行主链：`received -> normalize -> filter-visibility -> build-prompt -> generate -> wrap-output -> persist-best-effort`。

### 4.2 VideoPlay（正式）

1. 输出镜头级结构（shot plan / beat / style prompt / motion cue）。
2. 以 `CoreOutput` 为事实锚点，不得增加世界事实。
3. 允许在表现层补充镜头语法字段（camera/motion/lens），但这些字段不回写 Narrative。
4. 固定执行主链：`narrative-ingest -> episode-segmentation -> screenplay -> storyboard -> asset-render -> edit-compose -> qc-gate -> release-package`。
5. 每个 beat/shot 必须携带 `sourceEventIds`，并可回溯到输入 `spineEvents`。
6. `groundedRatio` 与 `assetCoverageRatio` 未达门槛时必须 fail-close。
7. 产线交付单位固定为 episode，不是单回合片段；发布包必须包含 video+poster+caption+metadata+trace 最小集。

### 4.3 Text/Video 一致性

1. 同一 narrative-engine turn 只能有一份 canonical `CoreOutput`；textplay 可按 turn 直接消费，videoplay 可按分集窗口聚合消费。
2. 允许表现风格差异（文字 vs 视频），不允许事实差异（事件集合与可见性约束）。
3. 双 renderer 都必须通过 visibility + POV 约束，不得在任一模态泄漏 internal 非玩家事件。

## 5. 编排层统一失败语义

### 5.1 统一错误信封

1. `reasonCode: string`
2. `actionHint: string`
3. `stage: world-studio | narrative-engine | renderer`
4. `traceId: string`

### 5.2 最小跨阶段 reasonCode

1. `CHAIN_WORLD_CONTEXT_UNREADY`
2. `CHAIN_AGENT_CONTEXT_UNREADY`
3. `CHAIN_NARRATIVE_REJECTED`
4. `CHAIN_RENDER_INPUT_INVALID`
5. `CHAIN_RENDER_ROUTE_UNAVAILABLE`
6. `CHAIN_RENDER_FAILED`

## 5.3 与运行协议和守卫协议的关系

1. `reasonCode + actionHint + traceId` 的跨阶段一致性由 `spec/mod/kernel/chain-run-contract.md` 中的事件协议字段固化。
2. 失败后的用户动作分流（继续、重跑、取消）由 `spec/mod/kernel/chain-run-contract.md` 固化。
3. 禁止模式与自动回归门禁由 `spec/mod/kernel/chain-guard-contract.md` 固化。
4. 本文件不再重复定义 step 级恢复字段与守卫脚本入口。

## 6. 与 realm world+agent 的对齐原则

1. 世界事实来源唯一：realm world control-plane 资产（events/lorebooks/worldview）。
2. 关系连续性来源唯一：realm agent + memory 资产。
3. Narrative 编译层负责把 realm 资产（worldview rules + world events + world lorebooks + agent rules + agent lorebooks）与 NarrativeContext scope 投影合并，产出 renderer 可消费上下文。
4. renderer 不直连 realm 领域写入接口。

## 7. 验收门禁（链路级）

1. world-studio 发布资产可被 narrative-engine step1 直接消费（无 legacy 适配层）。
2. narrative-engine 输出对 textplay 与 videoplay 输入均可稳定投影。
3. text/video 双 renderer 对同一 turn 不产生事实分叉。
4. 任一阶段失败均返回结构化 `reasonCode + actionHint + stage`。
5. traceId 可贯通 stage A/B/C，支持端到端审计。
6. videoplay 输出的 beat/shot 必须全量可追溯到 `sourceEventIds`。
7. videoplay 的 `groundedRatio` 与 `assetCoverageRatio` 需满足其 spec 门槛定义。
8. videoplay 必须支持“连续叙事输入 -> 分集产出”闭环，且分集可独立发布。
9. videoplay 任一分集中的 beat/shot 都必须可回溯到被聚合 turn 的 `sourceEventIds`。
10. 玩家交互入口必须位于 renderer 层（textplay/videoplay），不得把 narrative-engine 作为终端玩家直达入口。
11. videoplay 的 episode 输入窗口必须来自 narrative-engine 已生成的 canonical 事实流（可由 textplay 互动回合累积形成）。

## 8. 引用关系

1. world-studio：`nimi-mods/world-studio/spec/world-studio.md`
2. narrative-engine：`nimi-mods/narrative-engine/spec/narrative-engine.md`
3. textplay：`nimi-mods/textplay/spec/textplay.md`
4. videoplay：`nimi-mods/videoplay/spec/videoplay.md`
5. 链路运行协议：`spec/mod/kernel/chain-run-contract.md`
6. 链路守卫治理：`spec/mod/kernel/chain-guard-contract.md`
7. videoplay spec index：`nimi-mods/videoplay/spec/INDEX.md`
8. videoplay 分集切分契约：`nimi-mods/videoplay/spec/kernel/tables/segmentation-policy.yaml`
9. videoplay 剪辑合成契约：`nimi-mods/videoplay/spec/kernel/tables/edit-compose-policy.yaml`
10. videoplay 创作操作契约：`nimi-mods/videoplay/spec/kernel/creator-workflow-contract.md`
11. mod 通用治理：`spec/desktop/kernel/mod-governance-contract.md`
12. world 边界桩：`spec/realm/world.md`
13. agent 边界桩：`spec/realm/agent.md`
