---
title: Nimi Re:Life (Decision Retrospect) Mod SSOT
status: ACTIVE
version: v1.0
updated_at: 2026-02-24
rules:
  - Re:Life 业务执行真相唯一归属本文件；`@nimiplatform/nimi/ssot/mod/governance.md` 仅定义 Mod 通用治理规则。
  - Re:Life 执行主路径固定在 `nimi-mods/re-life`，不得以独立网页壳替代 Nimi runtime mod 形态。
  - Re:Life 必须通过 execution-kernel + hook + llm-adapter 接入；不得直连 core 数据平面或第三方 API。
  - 平行时空模拟必须采用结构化方法（决策树 + 因果链）为先；叙事（Screenplay）仅作为呈现层，不得作为推理依据。
  - AI Pipeline 固定三步结构：`generateObject(FactGraph) → generateObject(DecisionTree) → streamText(Screenplay)`；不得合并或跳过中间步骤。
  - 信息封印机制为强制默认：替代剧本只能使用决策时点可知信息；"全知模式"必须用户主动切换并明确标注。
  - 敏感个人数据（决策内容、时间线、MBTI 画像）默认仅本地处理，不得隐式上传。
  - 社交分享必须经过完整匿名化流水线（PII 检测 → LLM 语义改写 → 用户确认预览 → 签名发布），不得跳过任何环节。
  - 分享场景支持撤回（`status=revoked`），撤回后禁止新游玩。
  - 数据存储采用事件溯源（append-only events + snapshot）；模型版本、提示词版本、评估规则版本必须随 Scenario 记录。
  - Re:Life 的用户可见文案必须纳入 mod i18n；当前 en/zh 双语覆盖为强制要求。
  - Re:Life 的 root manifest 与源码 manifest 必须语义一致（版本、能力集合、ai 依赖声明）。
  - MBTI 定位为性格参考/偏好洞察，不得作为评判工具或决策建议依据。
  - Perfect Run 必须明确标注"反事实模拟，不构成现实承诺"，并显示推测等级与置信区间。
  - Re:Life 对外稳定调用面固定为 `@nimiplatform/mod-sdk/ai|hook|types|ui|logging|utils|runtime-route`；禁止 root import 与 internal/host 直连。
  - Re:Life 作为 external/default mod 时，必须保持 `manifest + entry + dist` 统一加载链路，不恢复 builtin 专用路径。
  - Re:Life 的源码 manifest 禁止回流 builtin 叙事（如 `hash: 'builtin-*'`、`built-in mod` 文案）；统一使用 external/default 术语。
  - Hook SDK 客户端创建入口固定为 `createHookClient(modId)`；禁止恢复 `createModHookClient` 别名入口。
---

# Nimi Re:Life（Decision Retrospect）唯一真相（SSOT）

## 1. Final-state 目标与边界

Re:Life 的目标是在 Nimi Desktop 内提供"人生决策回顾与平行时空模拟"工作台，统一承载：

1. 人生关键决策节点的录入与管理（对话式 + 表单双通道）。
2. 决策背景分析（时代/国运/情感/信息边界/MBTI 性格参考）。
3. 结构化平行路径推演（决策树 + 因果链 → 剧本叙事渲染）。
4. Perfect Run 多目标"金手指"模式（财富/关系/成长/零遗憾/自定义权重）。
5. 社交分享：脱敏决策场景 → 他人交互体验 → 选择对比 → 匿名聚合统计。

不属于 Re:Life 域：

1. 心理咨询或专业诊断（归专业机构）。
2. 投资/财务建议（Mod 不提供财务决策指导）。
3. 平台经济、身份、云受保护能力写入（归 `@nimiplatform/nimi/ssot/mod/governance.md` 与 L0 协议）。
4. 信念/观点追踪（归 Belief Tracker Mod，独立开发）。
5. 后端服务端组件（Mod 运行在 Desktop isolate）。
6. 实时外部数据源接入（基于用户输入 + LLM 知识，不主动拉取外部 API）。

## 2. Manifest 与能力契约

### 2.1 Mod 身份

1. `modId`: `world.nimi.relife`
2. `name`: `Re:Life`
3. `version`: `1.0.0`
4. `icon`: `re-life`
5. `entry`: `./dist/mods/re-life/index.js`
6. `kind`: `capability-mod`
7. 源码 manifest 与 root manifest 保持语义一致。

### 2.2 AI 消费与依赖

1. `ai.consume`: `chat`
2. required dependency（默认 chat）
   - `dependencyId`: `relife/chat-default`
   - `kind`: `model`
   - `capability`: `chat`
   - `engine`: `openai-compatible`
   - `modelId`：刻意不指定具体模型；runtime 解析为任意 openai-compatible chat 模型
3. preferred 绑定：`chat -> relife/chat-default`
4. 不声明、不触发模型生命周期写操作

### 2.3 必需 capability（按域分组）

AI/LLM：

1. `llm.text.generate` — 匿名化语义改写、MBTI 分析、社交游玩总结
2. `llm.text.stream` — Screenplay 实时流式输出
3. `llm.object.generate` — FactGraph / DecisionTree / ShareableScenario 结构化生成

Data（运行时真实键）：

1. `data.register.data-api.relife.decisions.upsert` — 写入/更新决策节点
2. `data.query.data-api.relife.decisions.upsert` — 读取写入结果/回放视图
3. `data.register.data-api.relife.decisions.list` — 注册决策列表能力
4. `data.query.data-api.relife.decisions.list` — 查询决策图
5. `data.register.data-api.relife.decisions.get` — 注册决策详情能力
6. `data.query.data-api.relife.decisions.get` — 查询单节点详情
7. `data.register.data-api.relife.scenarios.upsert` — 写入/更新场景
8. `data.query.data-api.relife.scenarios.upsert` — 读取场景写入结果
9. `data.register.data-api.relife.scenarios.list` — 注册场景列表能力
10. `data.query.data-api.relife.scenarios.list` — 查询场景列表
11. `data.register.data-api.relife.shared.publish` — 发布分享场景
12. `data.query.data-api.relife.shared.publish` — 读取发布结果
13. `data.register.data-api.relife.shared.revoke` — 撤回分享场景
14. `data.query.data-api.relife.shared.revoke` — 读取撤回结果
15. `data.register.data-api.relife.shared.list` — 注册分享列表能力
16. `data.query.data-api.relife.shared.list` — 查询已分享场景
17. `data.register.data-api.relife.metrics.aggregate` — 注册聚合统计能力
18. `data.query.data-api.relife.metrics.aggregate` — 查询匿名聚合统计
19. `data.query.data-api.runtime.route.options` — 查询可用路由

UI（运行时真实键）：

1. `ui.register.ui-extension.app.sidebar.mods`
2. `ui.register.ui-extension.app.content.routes`

### 2.4 Hook 订阅（按类型分组）

1. `event.publish` / `event.subscribe` — 发布/订阅 scenario.created、scenario.shared、perfectrun.completed 等事件
2. `inter-mod.send` — 向 Belief Tracker 发送 belief.suggestion（从回顾中识别的隐含信念）
3. `action.register` — 注册"生成替代剧本"、"启动 Perfect Run"、"分享场景"、"添加决策节点"等用户动作
4. `turn.pre-model` — 在对话流程 pre-model 阶段注入当前回顾的决策上下文

## 3. 核心对象与数据契约

### 3.1 DecisionGraph（决策图）

`DecisionGraph` 固定字段：

1. `nodes: DecisionNode[]`
2. `edges: Edge[]`
3. `branches: Branch[]`

### 3.2 DecisionNode（决策节点）

核心字段：

1. `nodeId: string` — ULID
2. `occurredAt: string` — ISO date，决策发生时间
3. `context: string` — 决策背景描述
4. `domain: career | finance | relationship | education | health`
5. `options: Option[]` — 当时面临的所有选项
6. `chosenOptionId: string` — 用户实际选择
7. `emotionTag: string` — 决策时情绪标签
8. `mbtiHint: MBTITypicalChoice` — MBTI 性格参考（该类型在此情境下的典型偏好）
9. `evidenceRefs: string[]` — 支撑信息引用
10. `informationBoundary: string[]` — 决策时点可知信息清单（信息封印依据）

### 3.3 Option（选项）

核心字段：

1. `optionId: string` — ULID
2. `label: string`
3. `expectedImpact: string`
4. `confidence: number` — 0-1
5. `causalLinks: string[]`

### 3.4 Edge（边）

核心字段：

1. `fromNodeId: string`
2. `fromOptionId: string`
3. `toNodeId: string`
4. `probability: number`

### 3.5 Scenario（场景）

核心字段：

1. `scenarioId: string` — ULID
2. `forkNodeId: string` — 分叉起始节点
3. `chosenOptionId: string` — 此场景选择的选项（替代选项）
4. `horizon: string` — 模拟终点时间
5. `causalChain: CausalStep[]` — 因果链步骤序列
6. `probability: number` — 综合概率评估
7. `scriptNarrative: string` — Screenplay 格式渲染文本
8. `evidenceRefs: string[]` — 推理依据引用
9. `modelTrace: string` — 模型版本 + 提示词版本（可追溯性）
10. `uncertaintyLevel: low | medium | high | speculative`
11. `informationMode: sealed | omniscient` — 使用封印信息还是全知信息

### 3.6 CausalStep（因果步骤）

核心字段：

1. `stepId: string`
2. `cause: string`
3. `effect: string`
4. `probability: number`
5. `evidenceRef: string`
6. `timeRef: string`

### 3.7 ShareableScenario（可分享场景）

核心字段：

1. `scenarioId: string` — ULID
2. `version: number`
3. `consent: boolean` — 用户显式授权
4. `publishedAt: string`
5. `graph: AnonymizedGraph` — 脱敏后的决策图
6. `originalPath: string[]` — 原主选择序列
7. `mbtiBaseline: string` — 原主 MBTI 类型
8. `status: active | revoked` — 撤回后禁止新游玩
9. `signature: string` — 签名校验

### 3.8 PerfectRunResult（Perfect Run 结果）

核心字段：

1. `runId: string` — ULID
2. `objective: wealth | relationship | growth | zero-regret | custom`
3. `customWeights?: { health: number, wealth: number, relationship: number, growth: number }` — 自定义权重（仅 custom 模式）
4. `optimalPath: string[]` — 最优路径选项序列
5. `scenarios: Scenario[]` — 各节点最优场景
6. `comparisonTable: ComparisonEntry[]` — 与现实路径的差异对比表
7. `disclaimer: string` — 反事实模拟声明（固定文案）

## 4. AI Pipeline

### 4.1 三步结构化推理

AI Pipeline 固定三步，不得合并或跳过：

1. `generateObject(FactGraph)` — 输入：用户决策背景 + 历史事实。输出：结构化事实图（事实、证据、不确定性标签、信息边界）。
2. `generateObject(DecisionTree)` — 输入：FactGraph + 用户选项 + 替代选项。输出：决策树 JSON（分支、前提、结果、概率、因果链）。
3. `streamText(Screenplay)` — 输入：选定 Scenario + 格式模板。输出：实时流式剧本（Act → Scene 增量输出）。

### 4.2 调用预算

1. 深度回顾（单节点）：3 次 AI 调用（FactGraph + DecisionTree + Screenplay）。
2. 社交游玩：N+2 次（N 节点各 1 次 + 总结 + 对比）。
3. Perfect Run：全节点扫描 + 因果修复 + 叙事，约 3N+2。

### 4.3 信息封印机制

1. 默认模式为"封印"（`sealed`）：AI 只使用 `informationBoundary` 内的信息生成替代剧本。
2. 用户可切换"全知模式"（`omniscient`）：使用全部已知信息，UI 必须明确标注切换状态。
3. Scenario 必须记录 `informationMode` 以标记生成时使用的信息范围。

### 4.4 版本追溯

1. 每个 Scenario 必须记录 `modelTrace`（模型 ID + 版本）。
2. 提示词模板版本必须随 Scenario 持久化。
3. 评估规则（因果一致性检查、置信度计算）版本必须可追溯。

## 5. UX 与呈现层

### 5.1 混合界面：时间轴 + 剧本

1. **Timeline（地铁图式导航）**：顶层全局视图，展示人生决策节点与分支。
2. **Screenplay View（并排剧本）**：点击节点进入沉浸式剧本对比（现实路径 vs 替代路径）。
3. 两种视图可自由切换，保持上下文。

### 5.2 节点添加

1. **对话式输入**：用户自然语言描述，LLM 解析为结构化 `DecisionNode` 草稿。
2. **表单编辑**：时间、选项、背景信息、情绪标签直接填写。
3. **统一确认**：两种输入方式最终都进入确认弹窗，用户审核后写入图。

### 5.3 MBTI 集成

1. 定位：性格滤镜/偏好洞察，不做判断。
2. 呈现：在每个决策节点显示"你的 MBTI 类型在这种情况下更可能选什么"。
3. 交互：可切换不同 MBTI 类型视角，查看剧本差异。
4. 范围：仅用于 Decision Retrospect，不用于 Belief Tracker。

## 6. Perfect Run（多目标金手指）

### 6.1 目标模式

1. `wealth` — 财富最大化：每个节点选收益最高选项。
2. `relationship` — 关系优先：每个节点选情感/人际最优选项。
3. `growth` — 成长最大化：选学习/突破最多的路径。
4. `zero-regret` — 零遗憾：选最符合内心真实想法的路径。
5. `custom` — 自定义：用户设定 health/wealth/relationship/growth 权重。

### 6.2 技术实现

1. 基于目标函数对每个节点 Option 评分。
2. Beam search + 因果一致性检查，串联最优路径。
3. 输出：完整人生剧本 + 与现实路径的差异对比表。
4. 不同目标线支持并排对比。

### 6.3 硬约束

1. 每个 Perfect Run 结果必须包含 `disclaimer`（反事实模拟声明）。
2. 每个推演节点必须标注推测等级（`uncertaintyLevel`）与置信区间。
3. 不得使用暗示"最优人生"的绝对性措辞。

## 7. 社交分享

### 7.1 分享流程

分享流程固定 4 步，不得跳过：

1. 用户选中决策节点或场景。
2. 匿名化流水线执行：PII 检测（规则 + NER）→ LLM 语义改写 → 差异预览确认。
3. 用户确认匿名化预览。
4. 生成签名 JSON "剧情包"并发布。

### 7.2 他人游玩

1. 收到分享 → 进入迷你文字冒险体验。
2. 代入初始设定（脱敏后的决策背景）。
3. 逐节点做出自己的选择，AI 渲染对应剧本。
4. 结尾大揭秘：原主选择 vs 玩家选择 vs MBTI 典型选择对比表。

### 7.3 社交指标（匿名聚合）

1. 节点选项占比（"78% 的人在这里选了 A"）。
2. 分歧指数（与原路径的偏离度）。
3. 最常见替代结局。
4. 重玩率。

### 7.4 隐私设计

1. 每个场景分享必须显式 opt-in（`consent: true`）。
2. 匿名化流水线必须完整执行，不允许跳过任何环节。
3. 支持撤回：`status=revoked` 后禁止新游玩。
4. 匿名统计：k-anonymity(k>=30) + 差分隐私噪声。

### 7.5 后端依赖（开放问题）

1. v1 使用点对点分享（签名 JSON 文件），无需后端。
2. 聚合统计功能依赖后端支持（链接托管、统计聚合），待后续确认。

## 8. 存储设计

### 8.1 存储格式

1. 事件溯源：append-only `events.jsonl` + 快照。
2. 增量计算：新决策节点和场景以事件追加，不覆盖历史。

### 8.2 增长与生命周期

1. 增长估算：~7-10MB/月（活跃用户）。
2. 生命周期策略：0-90天全量原始 → 3-12月压缩快照+索引 → 12月后聚合摘要。

### 8.3 命名空间

1. `private.decisions/{userId}` — 用户个人决策图与场景。
2. `shared.scenarios/{id}` — 已发布的分享场景。
3. `shared.metrics/{id}` — 匿名聚合统计。

## 9. 安全与隐私

1. 决策内容、时间线、MBTI 画像默认仅本地内存/本地存储处理。
2. 不得在未经用户确认的情况下上传原始输入与结果。
3. 若通过 Runtime-AI 调用 LLM，必须在 UI 明示将发送到的 route source（`local-runtime` 或 `token-api`）。
4. 不得在前端持久化明文第三方 API key。
5. 社交分享的匿名化流水线见 Section 7.4。

## 10. 审计与诊断

### 10.1 最小审计事件集

1. `relife.node.created`
2. `relife.node.updated`
3. `relife.scenario.generate.started`
4. `relife.scenario.generate.failed`
5. `relife.scenario.generate.succeeded`
6. `relife.perfectrun.started`
7. `relife.perfectrun.failed`
8. `relife.perfectrun.succeeded`
9. `relife.share.anonymize.started`
10. `relife.share.anonymize.confirmed`
11. `relife.share.published`
12. `relife.share.revoked`
13. `relife.social.play.started`
14. `relife.social.play.completed`

### 10.2 最小 reasonCode 集

1. `RELIFE_INPUT_INVALID` — 节点输入校验失败
2. `RELIFE_FACTGRAPH_GENERATE_FAILED` — FactGraph 生成失败
3. `RELIFE_DECISIONTREE_GENERATE_FAILED` — DecisionTree 生成失败
4. `RELIFE_SCREENPLAY_STREAM_FAILED` — Screenplay 流式生成失败
5. `RELIFE_PERFECTRUN_CAUSAL_INCONSISTENCY` — Perfect Run 因果一致性检查失败
6. `RELIFE_ANONYMIZE_FAILED` — 匿名化流水线执行失败
7. `RELIFE_SHARE_CONSENT_MISSING` — 分享缺少用户授权
8. `RELIFE_SCENARIO_SCHEMA_INVALID` — Scenario 结构校验失败
9. `RELIFE_ROUTE_UNAVAILABLE` — LLM 路由不可用

## 11. 接入与实现约束

1. Mod 入口必须提供 `createRuntimeMod(): RuntimeModRegistration`。
2. UI 注入通过 `createHookClient(modId).ui.register(...)` 完成。
3. AI 调用通过 `createAiClient(modId)` 完成，使用 `generateText`、`streamText`、`generateObject`。
4. 禁止保留独立网页入口依赖作为运行主链。
5. 禁止在业务代码中保留硬编码第三方 base URL 与用户 API key 透传模式。

## 12. 验收标准（必须全部满足）

1. 能力面：manifest capabilities 与源码常量一致，且通过 runtime 注册。
2. Pipeline 面：AI Pipeline 三步结构（generateObject x2 + streamText x1）完整执行，中间步骤不可跳过。
3. 匿名化面：社交分享流水线 4 步（PII 检测 → LLM 改写 → 用户确认 → 签名发布）完整执行，任一环节不可跳过。
4. 封印面：默认 sealed 模式下，替代剧本不包含决策时点之后的信息；omniscient 模式下 UI 明确标注。
5. 审计面：最小审计事件集（Section 10.1）可查询、可过滤、可复现。
6. 隐私面：敏感数据默认不离开本地；Route source 在 UI 明示。
7. 版本面：每个 Scenario 记录 modelTrace（模型+提示词+规则版本）。
8. 撤回面：`status=revoked` 后禁止新游玩，已有游玩记录保留但不可再访问原始场景。

## 13. 合规与外部依赖

1. MBTI 框架引用仅作为性格维度参考标签，不构成 Myers-Briggs 官方产品的再分发。
2. 若引用 MBTI 具体类型描述文本，需确认来源为公共领域知识或自行撰写，不得复制受版权保护的原文。
3. 外部开源依赖的 license 审核须在进入官方或 community 分发前完成。
4. 进入分发前必须补齐 license 审核结论。

## 14. 跨文档对齐与裁决顺序

1. Mod 通用治理与能力边界：`@nimiplatform/nimi/ssot/mod/governance.md`
2. Local Runtime 路由与依赖编排：`@nimiplatform/nimi/ssot/runtime/local-runtime.md`
3. AI 最后一公里跨域语义：`@nimiplatform/nimi/ssot/platform/ai-last-mile.md`
4. Brainstorm 设计记录：`docs/brainstorm/BS-2026-02-23-life-decision-mod.md`

冲突裁决：

1. mod 治理语义冲突 → 以 `ssot/mod/governance.md` 为准。
2. Re:Life 业务执行细节冲突 → 以本文件为准。
3. AI 路由与依赖冲突 → 以 `ssot/runtime/local-runtime.md` 为准。
4. AI 最后一公里跨域语义冲突 → 以 `ai-last-mile.md` 为准。
