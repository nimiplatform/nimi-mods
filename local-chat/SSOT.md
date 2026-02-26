---
title: Nimi Local Chat Mod SSOT
status: ACTIVE
version: v1.10
updated_at: 2026-02-22
rules:
  - Agent Chat 执行规范唯一归属本文件；其他 SSOT 仅可引用，不可重复定义本域规则。
  - Agent 聊天执行主路径固定为 desktop runtime `nimi-mods/local-chat`，Web 端不承担 Agent 聊天执行。
  - Local Chat 会话与回合仅做本地持久化，不写入后端 cloud chat runtime 模型。
  - Local Chat 路由覆盖由 mod 自主管理，仅影响该 mod，不得覆盖全局 AI Runtime 默认路由。
  - assistant 回合执行必须产出 turnAudit；promptTrace 在可用时记录并可追溯。
  - 会话能力统一经 hook capability 暴露，禁止在 UI 层绕过契约直接新增私有协议。
  - 会话入口固定在聊天主面板右上角 `Sessions` 下拉，不在左侧 Agent 列表下方显式展示。
  - 默认配置由 local-chat mod 本地持久化；主动联系仅由 `allowProactiveContact` 布尔开关控制并由 mod 内 heartbeat 任务执行。
  - Local Chat 路由来源口径固定为 `local-runtime/token-api`，默认 local-first，token-api 仅作可选回退。
  - Route profile 口径固定为 `chat/image/video/tts/stt/embedding`，业务侧只消费 `chat/tts/stt/embedding`。
  - local-chat 语音调用必须显式传 `routeSource`，禁止再用 `providerId` 承载 route source 语义。
  - local-chat 的 agent 语音风格提示词采用 `Auto Locked` 策略：自动组装 `language + stylePrompt` 并透传，不对终端用户暴露可编辑入口。
  - AI 调用入口统一为 `@nimiplatform/sdk/mod/ai`（`generateText|streamText|generateObject|transcribeAudio|generateEmbedding|synthesizeSpeech`），不保留 legacy 场景调用兼容路径。
  - TTS 必须通过独立 `SpeechAdapter` 抽象接入，不与聊天 LLM provider 强绑定。
  - TTS 接口与字段定义唯一来源是 `@nimiplatform/nimi/ssot/mod/governance.md`；local-chat 只消费，不定义 provider 协议细节。
  - 语音能力调用必须走 manifest 中声明的 speech 系列能力键（`llm.speech.providers.list`、`llm.speech.voices.list`、`llm.speech.synthesize`、`llm.speech.stream.open`、`llm.speech.stream.control`、`llm.speech.stream.close`、`llm.speech.transcribe`）；禁止在 local-chat UI 直连 provider 私有 `/audio/speech` 协议。
  - local-chat 对运行时能力读取一律通过 manifest 声明的 runtime capability 键（`data.query.data-api.local-chat.chat-targets.list`、`data.query.data-api.local-chat.chat-target.detail`、`data.query.data-api.local-chat.sessions.list`、`data.query.data-api.local-chat.sessions.get`、`data.query.data-api.local-chat.sessions.upsert`、`data.query.data-api.local-chat.sessions.delete`、`data.query.data-api.runtime.route.options`）查询，不允许使用 `@nimiplatform/sdk/mod/host`。
  - local-chat 代码组织固定为 `components/state/services/hooks` 分层；页面文件只保留容器装配，业务编排下沉到 controller hooks，不承载跨层协议实现细节。
  - local-chat 层禁止新增无语义中间层；任何新增层级必须证明可减少调试跳转和提升可定位性，否则不合入。
  - local-chat 禁止非 `index.ts/tsx` 的 re-export 壳文件；调用方必须直连真实实现模块，减少调试跳转层。
  - local-chat 服务域入口仅允许同域聚合导出，禁止通过 `services/index` 跨域转发 data/generation 能力。
  - local-chat 页面容器固定直连 `hooks/use-local-chat-page-controller.ts`，不通过 `hooks/index` 中间层跳转。
  - local-chat 容器层仅允许状态注入与行为绑定，不允许把 query/route patch/payload 组装逻辑回流到 view 组件。
  - local-chat 作为默认内置 mod 时，仍按 external mod 形态部署（manifest + entry + dist），加载链路与其他 sideload mod 完全一致。
  - local-chat 的 Hook 客户端创建入口统一为 `createHookClient(modId)`，不得恢复 `createModHookClient` 历史命名与中间别名。
  - local-chat 的源码 manifest 禁止回流 builtin 叙事（`hash: 'builtin-*'`、`built-in mod` 文案）；统一使用 external/default 术语。
  - local-chat 的 root manifest（`mod.manifest.yaml`）必须与源码单源保持一致：能力集合等于 `LOCAL_CHAT_PERMISSIONS`，版本号等于 `src/manifest.ts`。
  - local-chat 与 runtime-config 的共享运行时工具必须来自 `@nimiplatform/sdk/mod/utils` 或 `@nimiplatform/sdk/mod/runtime-route` 稳定面，禁止恢复本地重复 helper 门面。
  - local-chat 路由健康检查统一走 `createAiClient(...).checkRouteHealth`；若直接调用 Hook 健康能力，输入类型必须符合 `RuntimeLlmHealthInput`，不得回退裸 `Record<string, unknown>`。
  - local-chat 不得导入 `@nimiplatform/sdk/mod/model-options/*` 私有实现路径；模型分组/过滤能力只能经 `@nimiplatform/sdk/mod/model-options` 稳定面使用。
  - route 逻辑必须保持 `state/actions/queries` 分层；会话视图映射必须保持 `route/*` 与 `view/*` 服务分域，不允许回流到单体 helper。
  - turn-send 逻辑必须保持 `prompt/assistant-output/session-persist` 分层；`use-local-chat-turn-send.ts` 仅保留编排与错误处理。
  - turn-send 诊断写入必须在 `turn-send/diagnostics` 分层维护；容器与布局组件不得直接拼装诊断负载。
  - `local-chat-shell` 图标资产必须放在 `components/layout/icons.tsx` 等静态层，避免页面容器回流视觉常量。
---

# Nimi Local Chat 唯一真相（SSOT）

## 1. 目标与边界

1. 提供 Agent 本地会话主路径（`Desktop PRIVATE`）。
2. 提供会话切换/恢复/删除与回合诊断能力。
3. 与 Social/World 协同，但不持有关系治理或世界治理权限。

不属于 Local Chat 域：

1. Friendship 权限判定（归 Social 域）。
2. World 规则定义与维护（归 World 域）。
3. 平台经济结算与账本（归 Economy 域）。

## 2. 核心对象

### 2.1 LocalChatSession

1. `id`: 会话唯一标识。
2. `targetId`: 目标 Agent 账户 ID。
3. `worldId`: 会话绑定世界（来源于 Agent 当前居住世界）。
4. `title`: 会话标题。
5. `turns[]`: 回合列表。
6. `createdAt/updatedAt`: 时间戳。

### 2.2 LocalChatTurn

1. `id`: 回合唯一标识。
2. `role`: `user | assistant`。
3. `content`: 回合文本。
4. `timestamp`: 回合时间。
5. `latencyMs?`: 延迟统计。
6. `promptTrace?`: 提示词追溯信息。
7. `audit?`: 回合执行审计信息。

### 2.3 LocalChatPromptTrace

1. `routeSource`: 路由来源（如 `local-runtime` / `token-api`）。
2. `routeModel`: 实际命中模型。
3. `promptChars`: prompt 长度。
4. `retryAttempted/retryImproved`: 重试诊断。

### 2.4 LocalChatTurnAudit

1. `targetId/worldId`: 执行上下文。
2. `latencyMs`: 耗时。
3. `error`: 失败错误（成功为 `null`）。

### 2.5 LocalChatDefaultSettings

1. `enableVoice`: 是否启用语音相关路由配置（UI 与路由覆盖控制）。
2. `allowMultiReply`: 是否允许 Agent 在同一次用户输入后尝试追加补充回复。
3. `allowProactiveContact`: 是否允许 Agent 进入主动联系模式（由 heartbeat 任务驱动）。
4. `voiceName`: 语音音色（OpenAI-compatible 默认值域：`alloy|echo|fable|onyx|nova|shimmer`）。

### 2.6 SpeechAdapter（抽象层）

1. `SpeechAdapter` 与聊天 `LLM Adapter` 分离。
2. local-chat 不定义 Speech provider 协议；统一引用 `@nimiplatform/nimi/ssot/mod/governance.md` 的 TTS 接入标准。
3. 厂商私有 TTS 协议（非通用接口）不在 local-chat 层出现。

### 2.7 AgentVoiceStylePrompt（锁定策略）

1. 输入来源：`selectedTarget(displayName/bio/agentProfile/world)` + 当前用户文本。
2. 输出字段：
   - `language`：自动推断目标输出语言。
   - `stylePrompt`：agent persona/world 约束下的语音风格提示词。
3. local-chat 只负责组装并透传；provider 参数映射由 runtime/speech provider 适配层负责。

## 3. Hook 能力契约（与 `mod.manifest.yaml` 对齐）

Manifest 身份字段：

1. `id`: `world.nimi.local-chat`
2. `name`: `Local Chat`
3. `version`: `1.0.0`
4. `kind`: `capability-mod`
5. `icon`: `local-chat`
6. `entry`: `./dist/mods/local-chat/index.js`
7. `requires`: `desktop-core-cloud-chat`

Manifest `capabilities`（运行时真实键）：

1. `llm.text.generate`
2. `llm.text.stream`
3. `llm.speech.providers.list`
4. `llm.speech.voices.list`
5. `llm.speech.synthesize`
6. `llm.speech.stream.open`
7. `llm.speech.stream.control`
8. `llm.speech.stream.close`
9. `llm.speech.transcribe`
10. `data.register.data-api.local-chat.chat-targets.list`
11. `data.query.data-api.local-chat.chat-targets.list`
12. `data.register.data-api.local-chat.chat-target.detail`
13. `data.query.data-api.local-chat.chat-target.detail`
14. `data.register.data-api.local-chat.sessions.list`
15. `data.query.data-api.local-chat.sessions.list`
16. `data.register.data-api.local-chat.sessions.get`
17. `data.query.data-api.local-chat.sessions.get`
18. `data.register.data-api.local-chat.sessions.upsert`
19. `data.query.data-api.local-chat.sessions.upsert`
20. `data.register.data-api.local-chat.sessions.delete`
21. `data.query.data-api.local-chat.sessions.delete`
22. `data.query.data-api.runtime.route.options`
23. `ui.register.ui-extension.app.sidebar.mods`
24. `ui.register.ui-extension.app.content.routes`
25. `ui.register.ui-extension.runtime.devtools.panel`

Manifest `ai.consume` 与 `ai.dependencies`：

1. `ai.consume`: `chat | tts | stt`
2. required:
   - `local-chat/chat-qwen2.5-7b` (`model`, `capability=chat`)
3. optional:
   - `local-chat/stt-local-node` (`node`, `capability=stt`)
4. alternatives:
   - `local-chat/tts-qwen3-1.7b` / `local-chat/tts-qwen3-0.6b` (`service`, `capability=tts`)
5. preferred:
   - `chat -> local-chat/chat-qwen2.5-7b`
   - `tts -> local-chat/tts-qwen3-1.7b`

SDK 调用面（非 capability 键）：

1. `@nimiplatform/sdk/mod/ai.generateText`
2. `@nimiplatform/sdk/mod/ai.streamText`
3. `@nimiplatform/sdk/mod/ai.generateObject`
4. `@nimiplatform/sdk/mod/ai.synthesizeSpeech`
5. `@nimiplatform/sdk/mod/ai.transcribeAudio`
6. `@nimiplatform/sdk/mod/ai.generateEmbedding`
7. 不暴露历史场景调用入口（`invokeScenario` / `resolveScenarioRuntimeConfig`）作为业务调用入口。

语音返回契约：

1. `synthesize` 统一返回 `audioUri`（本地可播放 URI）。
2. local-chat 只负责播放与诊断展示，不处理 provider 原始响应协议。
3. 语音失败不阻断文本回合成功提交，必须写入 turn diagnostics。

多模态消费边界：

1. `stt/embedding` 为可选能力；未启用时必须返回显式能力错误，不允许静默降级为“空成功”。
2. local-chat 默认只在用户触发的语音/检索链路调用 `stt/embedding`，不作为每轮强制步骤。

语音请求扩展字段（引用 `ssot/mod/governance.md`）：

1. `routeSource?: 'auto' | 'local-runtime' | 'token-api'`
2. `language?: string`
3. `stylePrompt?: string`

## 4. 权限与关系事实（引用 Social）

Local Chat 不拥有关系治理模型，只消费 Social 原子事实：

1. 用户向 Agent 发消息前置条件：`Friendship(HUMAN_AGENT, ACTIVE)`。
2. `AGENT_TO_OTHER_USER` 与 `AGENT_TO_AGENT` 在 V1 为 `PROHIBITED`。
3. `MASTER_OWNED` Agent 创建时自动与 Master 建立 `Friendship(HUMAN_AGENT, ACTIVE)`。
4. `WORLD_OWNED` Agent 不自动与 Creator 建立好友关系。
5. local-chat 目标列表只消费 `Agent Friends`（`Friendship(HUMAN_AGENT, ACTIVE)`）；`My Agents/My World Agents` 资产列表不直接作为会话目标源。

上述事实定义以 `@nimiplatform/nimi/ssot/boundaries/social.md` 为准；本文件不重定义其状态机。

## 5. 关键行为规则

1. 会话按目标 Agent 维度归档与切换；`Sessions` 菜单只展示当前 Agent 的会话。
2. 若目标 Agent 下无会话，首次进入自动创建默认会话。
3. 会话入口位于聊天主面板右上角下拉菜单，支持查看、切换、`New`、`Delete`。
4. 删除当前会话后自动切到最近会话；若已无剩余会话，自动创建并激活新会话。
5. 每次发送消息至少记录：
   - user turn
   - assistant turn（含成功或失败反馈）
6. assistant 回合必须写入 `turnAudit`；有 prompt trace 时写入 `promptTrace`。
7. 失败回合必须写入 `turnAudit.error`，用于诊断与重试决策。
8. 路由 override 保存在 mod 本地存储，仅对 local-chat 生效。
9. Local Chat 路由覆盖至少包含 `chat/tts/stt`；`routeSource` 决定路由来源，`providerId + voiceId` 仅作为 TTS provider 参数。
   - `image/video` 属于 world-studio 等多媒体业务域，不在 local-chat 主交互链路。
   - `embedding` 由 runtime 统一能力管理并按需调用，不作为 local-chat 独立路由面板默认项。
10. 默认配置保存在 mod 本地存储，仅对 local-chat 生效。
11. `allowProactiveContact=true` 时，mod 内 heartbeat 任务以随机间隔（30-60 分钟）扫描会话上下文并决定是否主动联系。
12. 主动联系判定由模型基于上下文自主决策，不设置固定“每回合最大回复数”硬阈值。
13. 通过 Runtime Setup Verified 一键安装 VoiceDesign 后，local-chat 默认 `tts` 绑定应指向该 local model，且 `ttsRouteSource` 保持 `auto` 以命中 mod override。

## 5.1 实现组织约束（代码级）

1. `local-chat-page.tsx` 仅承担容器装配；页面主体 UI 由 `components/local-chat-shell.tsx` 承载。
2. 页面状态编排（targets/sessions/route/speech/send）下沉到 controller hooks（如 `use-local-chat-page-controller.ts`）。
3. 纯数据转换与文本清洗归入 `services/*`。
4. 视觉渲染块（气泡/侧栏）归入 `components/*`。
5. 本地持久化（session/defaults）归入 `state/*`。
6. 播放/发送等流程统一沉淀在 `hooks/*`，避免页面回流业务流程代码。
7. 数据域必须模块化：`data/index.ts` 聚合，`targets-list-query` / `target-detail-query` / `world-context-resolver` / `prompt-builder` / `cache-store` 各司其职。
8. 禁止恢复 `data.ts` 单体文件。

## 6. 与其他 SSOT 对齐

1. `boundaries/agent.md` 仅定义 Agent 身份、归属、world 绑定边界；不再定义 Agent Chat 执行细节。
2. `boundaries/social.md` 仅定义关系与权限原子事实边界；Agent Chat 执行规范全部引用本文件。
3. `ssot/desktop/runtime-contract.md` 仅定义双平面架构与路由边界；PRIVATE Agent Chat 细节由本文件定义。
4. `ssot/mod/governance.md` 仅定义通用 Mod 治理规则；Local Chat 业务规范由本文件定义。
5. `boundaries/world.md` 仅定义 World 设定与治理边界；会话世界上下文消费 Agent 绑定 world，不改变世界治理语义。
6. 本地模型来源、导入校验与 `local-runtime/token-api` 路由语义统一引用 `ssot/runtime/local-runtime.md`。
7. `ai-last-mile.md` 将本域定位为关系连续性在会话执行层的直接落地；跨域总语义以该文件为准。
