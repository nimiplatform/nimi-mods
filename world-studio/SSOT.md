---
title: Nimi World Studio Mod SSOT
status: ACTIVE
version: v1.0
updated_at: 2026-02-22
rules:
  - World Studio 业务执行真相唯一归属本文件；`@nimiplatform/nimi/ssot/boundaries/world.md` 仅保留 World 域控制面边界语义。
  - World Studio 执行主路径固定为 `nimi-mods/world-studio`，不得回流 legacy world-import/forge 运行链路。
  - World Studio 仅消费通用 world control-plane + hook capability；后端不得新增 world-studio 私有拆书协议。
  - 世界建模必须采用事件中心化模型：`events.primary/events.secondary` 为一等对象；“章节”仅允许作为输入组织信息。
  - CREATE 与 MAINTAIN 主编辑路径固定为结构化事件图编辑器；Raw JSON 仅可作为调试折叠区，不得作为默认工作流。
  - Distill 管线阶段固定为 `INGEST -> COARSE -> FINE -> MERGE -> CHECKPOINTS -> SYNTHESIZE -> DRAFT -> PUBLISH`。
  - 路由覆盖固定为 coarse/fine 双配置，route source 固定 `local-runtime | token-api`，仅影响 world-studio 自身。
  - world-studio 路由覆盖持久化键固定 `nimi.world-studio.route-override.v2.{userId}`。
  - SYNTHESIZE 与 PUBLISH 之前必须通过事件与质量门禁；主线事件缺失证据必须阻断。
  - World Studio 任务执行固定 single-flight：任一时刻最多一个 active task；任务状态必须可恢复、可取消、可审计。
  - 发布与维护写操作必须落到通用 world mutation 审计流，不得绕过 `world/worldview/lorebooks/events/mutations` 事务边界。
  - world-studio 的用户可见文案必须纳入 mod i18n，当前 en/zh 双语覆盖为强制要求。
  - 控制层主链固定 `page-controller -> view-model-builder(panelBindings) -> panel-builders`，禁止恢复额外中间门面层。
---

# Nimi World Studio 唯一真相（SSOT）

## 1. Final-state 目标与边界

World Studio 的目标是提供 Creator 在 Desktop 端的世界创建与维护工作台，覆盖完整链路：

1. 访问与分流：`NO_ACCESS | CREATE | MAINTAIN`。
2. 结构化抽取：文本分块、事件抽取、质量门禁、合成草稿。
3. 结构化维护：world/worldview/events/lorebooks 的受控维护与冲突处理。
4. 发布治理：通过通用 world APIs 发布并写入审计。

不属于 World Studio 域：

1. World Level 治理公式与资源配额定义（归 `@nimiplatform/nimi/ssot/boundaries/world.md`）。
2. Mod 通用治理链、权限大类、分发体系（归 `@nimiplatform/nimi/ssot/mod/governance.md`）。
3. 本地 AI Runtime 生命周期编排（归 `@nimiplatform/nimi/ssot/runtime/local-runtime.md`）。

## 2. Manifest 与能力契约

### 2.1 Mod 身份

1. `modId`: `world.nimi.world-studio`
2. `name`: `世界工坊`
3. `version`: `1.0.0`
4. `entry`: `./dist/mods/world-studio/index.js`
5. `kind`: `capability-mod`
6. 源码 manifest 与 root manifest 必须语义一致。

### 2.2 AI 消费与依赖

1. `ai.consume`: `chat`, `image`
2. required dependency（默认 chat）
   - `dependencyId`: `world-studio/chat-qwen2.5-7b`
   - `kind`: `model`
   - `capability`: `chat`
   - `modelId`: `qwen2.5-7b-instruct`
   - `engine`: `openai-compatible`
3. optional dependency（图片能力）
   - `dependencyId`: `world-studio/image-token-node`
   - `kind`: `node`
   - `capability`: `image`
   - `nodeId`: `image.generate.token-api`
4. preferred 绑定：`chat -> world-studio/chat-qwen2.5-7b`

### 2.3 必需 capability（运行时真实键）

LLM：

1. `llm.text.generate`
2. `llm.text.stream`
3. `llm.image.generate`

Data（均为 `data.query.*`）：

1. `data.query.data-api.world.access.me`
2. `data.query.data-api.world.landing.resolve`
3. `data.query.data-api.world.draft.create`
4. `data.query.data-api.world.draft.get`
5. `data.query.data-api.world.draft.update`
6. `data.query.data-api.world.draft.publish`
7. `data.query.data-api.world.maintenance.get`
8. `data.query.data-api.world.maintenance.update`
9. `data.query.data-api.world.events.list`
10. `data.query.data-api.world.events.batch-upsert`
11. `data.query.data-api.world.events.delete`（逻辑归档，不做物理硬删）
12. `data.query.data-api.world.lorebooks.list`
13. `data.query.data-api.world.lorebooks.batch-upsert`
14. `data.query.data-api.world.lorebooks.delete`（逻辑归档，不做物理硬删）
15. `data.query.data-api.world.drafts.list`
16. `data.query.data-api.world.worlds.mine`
17. `data.query.data-api.world.mutations.list`
18. `data.query.data-api.creator.agents.list`
19. `data.query.data-api.creator.agents.create`
20. `data.query.data-api.creator.agents.batch-create`
21. `data.query.data-api.runtime.route.options`

UI：

1. `ui.register.ui-extension.app.sidebar.mods`
2. `ui.register.ui-extension.app.content.routes`

## 3. 核心对象与状态机

### 3.1 Landing / 工作区状态

1. landing mode：`NO_ACCESS | CREATE | MAINTAIN`
2. create step：`SOURCE | INGEST | EXTRACT | CHECKPOINTS | SYNTHESIZE | DRAFT | PUBLISH`
3. distill stage：`INGEST | COARSE | FINE | MERGE | CHECKPOINTS | SYNTHESIZE | DRAFT | PUBLISH`

### 3.2 任务状态机（single-flight）

任务类型：

1. `CREATE_PHASE1`
2. `CREATE_PHASE2`
3. `CREATE_WORLD_COVER`
4. `CREATE_CHARACTER_PORTRAIT`
5. `CREATE_SAVE_DRAFT`
6. `CREATE_PUBLISH_DRAFT`
7. `MAINTAIN_SAVE`
8. `MAINTAIN_SYNC_EVENTS`
9. `MAINTAIN_SYNC_LOREBOOKS`

任务状态：

1. `RUNNING`
2. `PAUSE_REQUESTED`
3. `PAUSED`
4. `CANCEL_REQUESTED`
5. `CANCELED`
6. `FAILED`
7. `COMPLETED`

硬约束：

1. 任一时刻仅允许一个 active task。
2. 冲突任务必须返回 `WORLD_STUDIO_TASK_CONFLICT`。
3. 非原子任务必须支持 checkpoint 与恢复。
4. pause/cancel/recover 行为必须记录任务审计事件。

### 3.3 事件中心化知识草稿

`WorldStudioKnowledgeGraphDraft` 固定字段：

1. `worldSetting`
2. `timeline[]`
3. `locations[]`
4. `characters[]`
5. `events.primary[]`
6. `events.secondary[]`
7. `characterRelations[]`
8. `futureHistoricalEvents[]`
9. `narrativeArc?`
10. `characterProfiles?`
11. `characterAliasMap?`

`EventNodeDraft` 核心字段：

1. `id`
2. `level: PRIMARY | SECONDARY`
3. `parentEventId`
4. `title/summary/cause/process/result/timeRef`
5. `locationRefs[]/characterRefs[]/dependsOnEventIds[]`
6. `evidenceRefs[]`
7. `confidence`
8. `needsEvidence`

## 4. 运行主链路

### 4.1 CREATE 主链

1. `SOURCE`: 录入来源文本（或文件预览）。
2. `INGEST/EXTRACT`: 分块抽取，支持失败分块重跑与自动缩块重试。
3. `CHECKPOINTS`: 结构化事件图复核与修订。
4. `SYNTHESIZE`: 合成 world/worldview/events/lorebooks 草稿。
5. `DRAFT`: 草稿编辑与资产补齐。
6. `PUBLISH`: 事务发布到 world control-plane。

### 4.2 MAINTAIN 主链

1. 读取 `maintenance + events + lorebooks + mutations`。
2. 编辑 world/worldview/events/lorebooks。
3. 使用 `ifSnapshotVersion` 提交，冲突时返回维护冲突语义。
4. 支持事件同步模式：`merge | replace`。
5. `replace` 必须先归档当前 active 事件，再写入新 active 事件集合；不得物理删除历史知识资产。

### 4.3 编辑器主路径

1. CREATE 与 MAINTAIN 统一使用事件图编辑器。
2. PRIMARY/SECONDARY、evidence、依赖关系在同一图中维护。
3. Raw JSON 仅用于 debug 折叠查看，不进入默认交互主链。

## 5. 路由与模型语义

### 5.1 路由覆盖结构

1. route stage：`coarse | fine`
2. route override map：`{ coarse: RuntimeRouteBinding | null, fine: RuntimeRouteBinding | null }`
3. route source：`local-runtime | token-api`

语义：

1. coarse route 作用于 `INGEST/COARSE`。
2. fine route 作用于 `FINE/MERGE/SYNTHESIZE`。
3. `retryWithFineRoute=true` 且 failed-retry 时，允许 coarse/fine 统一使用 fine 绑定。

### 5.2 持久化与作用域

1. local storage key：`nimi.world-studio.route-override.v2.{userId}`
2. 仅影响 world-studio，不能覆盖全局 runtime 默认路由。
3. 若 override 缺失，回落 runtime default binding。

### 5.3 路由就绪门禁

Route readiness reasonCode（最小集）：

1. `WORLD_STUDIO_ROUTE_BINDING_MISSING`
2. `WORLD_STUDIO_LOCAL_MODEL_MISSING`
3. `WORLD_STUDIO_LOCAL_MODEL_UNAVAILABLE`
4. `WORLD_STUDIO_LOCAL_MODEL_UNHEALTHY`
5. `WORLD_STUDIO_TOKEN_ROUTE_INCOMPLETE`
6. `WORLD_STUDIO_CONNECTOR_MISSING`
7. `WORLD_STUDIO_TOKEN_MODEL_UNAVAILABLE`
8. `WORLD_STUDIO_ROUTE_READY`

Embedding readiness reasonCode（最小集）：

1. `WORLD_STUDIO_EMBEDDING_NOT_REQUIRED`
2. `WORLD_STUDIO_EMBEDDING_ROUTE_UNREADY`
3. `WORLD_STUDIO_EMBEDDING_BUILDING`
4. `WORLD_STUDIO_EMBEDDING_READY`
5. `WORLD_STUDIO_EMBEDDING_BUILD_FAILED`
6. `WORLD_STUDIO_EMBEDDING_NOT_BUILT`

## 6. 质量门禁与阻断规则

### 6.1 QualityGate 输出契约

1. `status: PASS | WARN | BLOCK`
2. `issues[]`（`code/severity/message/detail?`）
3. `pass: boolean`（兼容字段）
4. `reasons[]`（兼容字段）
5. `metrics`（覆盖率与完整度指标）

### 6.2 BLOCK 条件（必须阻断 SYNTHESIZE）

1. `PRIMARY` 事件为 0（`WORLD_STUDIO_PRIMARY_EVENTS_MISSING`）。
2. PRIMARY 结构不完整（标题或叙事核心字段缺失）。
3. `primaryEvidenceCoverage < 1.0`（存在 PRIMARY 缺证据）。
4. `chunkSuccessRatio < 0.4`（抽取成功率过低）。
5. `timeline` 与 PRIMARY `timeRef` 同时为空（`WORLD_STUDIO_TEMPORAL_ANCHOR_MISSING`）。

### 6.3 WARN 条件（可进入 CHECKPOINTS，需显式提示）

1. `0.4 <= chunkSuccessRatio < 0.7`。
2. 叙事完整度、故事弧、角色名称纯度、角色档案覆盖、worldSetting 等非阻断缺口。
3. PRIMARY `timeRef` 覆盖率偏低（`WORLD_STUDIO_PRIMARY_TIME_REF_LOW`）。

### 6.4 进入 SYNTHESIZE 前的附加硬门槛

1. phase1 quality gate 不能是 `BLOCK`。
2. `selectedStartTimeId` 必填。
3. `selectedCharacters.length > 0`。
4. 至少一个 PRIMARY 事件。
5. 所有 PRIMARY 均有 `evidenceRefs`。

不满足时必须返回显式错误（如 `WORLD_STUDIO_PHASE1_QUALITY_GATE_BLOCKED`、`WORLD_STUDIO_EVENT_GRAPH_INVALID`、`WORLD_STUDIO_EVENT_EVIDENCE_REQUIRED`）。

## 7. 发布、维护与冲突处理

### 7.1 发布语义

1. 发布事务必须原子写入：`world/worldview/lorebooks/events/mutations`。
2. 任一步失败整体回滚。
3. world-owned agent 同步为后续流程，不回滚主发布事务。

### 7.2 维护语义

1. 维护提交使用 `ifSnapshotVersion` 防冲突。
2. 冲突统一映射为 `WORLD_STUDIO_MAINTENANCE_CONFLICT`。
3. UI 必须提供 `Reload Remote` 与 `Force` 类恢复操作入口。

### 7.3 迁移语义

1. 运行主链不再接受 `majorEvents` / `worldFacts`。
2. 输入面仅接受 `events.primary/events.secondary/futureHistoricalEvents` 与 `worldLorebooks`。
3. 旧字段不得回流主链读写，也不保留运行时兼容映射。

## 8. 错误码与审计事件

### 8.1 领域错误码（最小集合）

1. `WORLD_ACCESS_DENIED`
2. `WORLD_STUDIO_STRUCTURED_OUTPUT_INVALID`
3. `WORLD_STUDIO_PARSE_JOB_FAILED`
4. `WORLD_STUDIO_PHASE1_ALL_CHUNKS_FAILED`
5. `WORLD_STUDIO_PHASE1_QUALITY_GATE_BLOCKED`
6. `WORLD_STUDIO_COARSE_JSON_PARSE_FAILED`
7. `WORLD_STUDIO_FINE_JSON_PARSE_FAILED`
8. `WORLD_STUDIO_MODEL_ROUTE_INVALID`
9. `WORLD_STUDIO_SYNTHESIZE_BLOCKED_BY_EVENT_GRAPH`
10. `WORLD_STUDIO_EVENT_GRAPH_INVALID`
11. `WORLD_STUDIO_EVENT_EVIDENCE_REQUIRED`
12. `WORLD_STUDIO_MAINTENANCE_CONFLICT`

### 8.2 必需审计事件

1. `world-studio:event-extract:start|done|failed`
2. `world-studio:event-extract:auto-shrink-retry`
3. `world-studio:event-gate:pass|warn|blocked`
4. `world:event:batch-upsert:done|failed`
5. `world:draft:create|update|publish:start|done|failed`
6. `world:maintenance:update:done|failed`
7. `world-studio:task:start|pause|resume|cancel|recover|done|failed`

## 9. 实现组织约束（代码级）

1. 页面容器固定：`world-studio-page -> page-controller`。
2. 控制层主链固定：`page-controller -> world-studio-view-model-builder(panelBindings) -> panel-builders`。
3. `WorldStudioViewModel` 为唯一控制层输入语义，禁止回流旧命名与中间壳层。
4. 路由覆盖与 hydration 必须分域：
   - `hooks/route-overrides/{store,derived,actions}`
   - `hooks/hydration/{hydrate-draft,hydrate-maintain}`
5. `services/index.ts` 仅允许导出：
   - `snapshot-normalize`
   - `event-graph-map`
   - `mutation-payload`
6. 禁止恢复 `world-studio-page-utils` 等门面转发层。
7. 用户可见文案必须进入 `locales/en.json` 与 `locales/zh.json`，受 i18n 守卫检查。

## 10. 跨文档对齐与裁决顺序

1. World 治理与控制面：`@nimiplatform/nimi/ssot/boundaries/world.md`
2. Mod 通用治理与能力边界：`@nimiplatform/nimi/ssot/mod/governance.md`
3. Local Runtime 路由与依赖编排：`@nimiplatform/nimi/ssot/runtime/local-runtime.md`
4. AI 最后一公里跨域语义：`@nimiplatform/nimi/ssot/platform/ai-last-mile.md`

冲突裁决：

1. world 控制面语义冲突 -> 以 `boundaries/world.md` 为准。
2. mod 治理语义冲突 -> 以 `ssot/mod/governance.md` 为准。
3. world-studio 业务执行细节冲突 -> 以本文件为准。
