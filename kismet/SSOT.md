---
title: Nimi Kismet Mod SSOT
status: ACTIVE
version: v1.0
updated_at: 2026-02-23
rules:
  - Kismet 业务执行真相唯一归属本文件；`@nimiplatform/nimi/ssot/mod/governance.md` 仅定义 Mod 通用治理规则。
  - Kismet 执行主路径固定在 `nimi-mods/kismet`，不得以独立网页壳替代 Nimi runtime mod 形态。
  - Kismet 必须通过 `execution-kernel + hook + llm-adapter` 接入；不得直连 core 数据平面。
  - Kismet 必须提供统一双入口：`Prompt-Import` 与 `Runtime-AI`；两者输出契约必须一致，不允许两套结果模型。
  - `Runtime-AI` 入口必须通过 `@nimiplatform/mod-sdk/ai` 调用，禁止在 Mod 内直连第三方 `/chat/completions` 自定义 URL。
  - 路由来源固定为 `local-runtime | token-api`，默认 local-first；fallback 到导入模式必须用户可见并可审计。
  - 用户输入的八字与分析结果属于本地敏感数据，默认仅本地处理与本地导出，不得隐式上传。
  - 导出能力仅允许用户显式触发（JSON/PDF/HTML）；禁止后台自动上报或自动同步到云端。
  - Kismet 的用户可见文案必须纳入 mod i18n；当前 zh/en 双语覆盖为强制要求。
  - Kismet 作为 external/default mod 时，必须保持 `manifest + entry + dist` 统一加载链路，不恢复 builtin 专用路径。
  - Kismet 对外稳定调用面固定为 `@nimiplatform/mod-sdk/ai|hook|types|ui|logging|utils|runtime-route`；禁止 root import 与 internal/host 直连。
  - Kismet 的 root manifest 与源码 manifest 必须语义一致（版本、能力集合、ai 依赖声明）。
---

# Nimi Kismet 唯一真相（SSOT）

## 1. Final-state 目标与边界

Kismet 的目标是在 Nimi Desktop 内提供八字运势可视化分析工作台，统一承载：

1. 八字基础信息录入与校验。
2. 结构化分析结果导入与一致性校验。
3. 1-100 岁运势 K 线可视化与分维分析报告展示。
4. 本地导出（JSON/PDF/HTML）与审计留痕。

不属于 Kismet 域：

1. 社交关系与聊天路由治理（归 `@nimiplatform/nimi-mods/local-chat/SSOT.md` / `@nimiplatform/nimi/ssot/boundaries/social.md`）。
2. 模型与服务生命周期写操作（归 `@nimiplatform/nimi/ssot/runtime/local-runtime.md`，由 Core 控制面独占）。
3. 平台经济、身份、云受保护能力写入（归 `@nimiplatform/nimi/ssot/mod/governance.md` 与 L0 协议）。

## 2. 产品主链（最终态）

Kismet 固定双入口，但统一单一结果契约：

1. `Prompt-Import`（默认入口）
   - 用户填写八字参数。
   - Mod 生成系统指令+用户提示词并复制。
   - 用户在任意外部 AI 执行。
   - 用户回填 JSON。
   - Mod 完成结构化校验并渲染。
2. `Runtime-AI`（受控入口）
   - 用户填写同一套八字参数。
   - Mod 通过 `@nimiplatform/mod-sdk/ai.generateText|streamText` 生成结果。
   - 结果经同一校验管线进入渲染。

硬约束：

1. 两入口输出必须落入同一 `KismetResult` 结构。
2. 任一入口失败都必须返回结构化 `reasonCode + actionHint`。
3. `Runtime-AI` 不可用时，必须显式提示并回退到 `Prompt-Import`。

## 3. Manifest 与能力契约

### 3.1 Mod 身份

1. `modId`: `world.nimi.kismet`
2. `name`: `Kismet`
3. `version`: `1.0.0`
4. `icon`: `kismet`
5. `entry`: `./dist/mods/kismet/index.js`
6. `kind`: `capability-mod`
7. 源码 manifest 与 root manifest 保持语义一致。

### 3.2 必需 capability

UI：

1. `ui.register.ui-extension.app.sidebar.mods`
2. `ui.register.ui-extension.app.content.routes`

AI（Runtime-AI 入口）：

1. `llm.text.generate`
2. `llm.text.stream`（可选流式展示时启用）
3. `data.query.data-api.runtime.route.options`

### 3.3 AI 依赖声明（ai.dependencies v2）

1. `ai.consume`: `chat`
2. 当前 manifest 未声明 `ai.dependencies`（由 runtime route 与全局 runtime 配置解析具体模型）。
3. 若后续引入 `ai.dependencies`，必须在同一变更中同步更新 `mod.manifest.yaml` 与本文件。
4. 不声明、不触发模型生命周期写操作。

## 4. 领域对象与数据契约

## 4.1 输入契约（KismetInput）

1. `name?`
2. `gender: Male | Female`
3. `birthYear`
4. `yearPillar | monthPillar | dayPillar | hourPillar`
5. `startAge`
6. `firstDaYun`

校验规则：

1. 四柱与起运字段不能为空。
2. `startAge` 必须为正整数。
3. `birthYear` 必须在可配置范围内（默认 `1900-2100`）。

## 4.2 输出契约（KismetResult）

1. `analysis`
   - `summary/personality/industry/fengShui/wealth/marriage/health/family/crypto`
   - 对应 `*Score`（0-10）
   - `cryptoYear/cryptoStyle`
2. `chartData[]`
   - `age(1..100)`
   - `year`
   - `ganZhi`
   - `daYun`
   - `open/close/high/low/score`
   - `reason`

硬约束：

1. `chartData` 固定 100 条，对应虚岁 1-100。
2. `age` 必须严格单调递增且唯一。
3. `high >= max(open, close)`，`low <= min(open, close)`。
4. `score` 范围固定 `0-100`。
5. `reason` 必须为可展示文本，默认建议 20-30 字短批断。

## 5. 运行时行为规则

1. `Prompt-Import` 与 `Runtime-AI` 共用同一解析与校验器。
2. 解析器必须支持从 markdown code block 中抽取 JSON。
3. 当 JSON 缺失关键字段时，必须 fail-close，不允许静默补全为"成功"。
4. 图表渲染必须按 K 线语义呈现涨跌与区间，不允许退化为折线占位图。
5. 导出按钮必须是显式用户动作，不允许自动触发下载。

## 6. 接入与实现约束

1. Mod 入口必须提供 `createRuntimeMod(): RuntimeModRegistration`。
2. UI 注入通过 `createHookClient(modId).ui.register(...)` 完成。
3. AI 调用通过 `createAiClient(modId)` 完成。
4. 禁止保留独立网页入口依赖（如 `index.html` CDN script/importmap）作为运行主链。
5. 禁止在业务代码中保留硬编码第三方 base URL 与用户 API key 透传模式。

## 7. 审计与诊断

Kismet 最小审计事件集：

1. `kismet.input.submitted`
2. `kismet.prompt.copied`
3. `kismet.import.started`
4. `kismet.import.failed`
5. `kismet.import.succeeded`
6. `kismet.ai.generate.started`
7. `kismet.ai.generate.failed`
8. `kismet.ai.generate.succeeded`
9. `kismet.fallback.to-import-mode`
10. `kismet.export.json`
11. `kismet.export.pdf`
12. `kismet.export.html`

最小 reasonCode 集：

1. `KISMET_INPUT_INVALID`
2. `KISMET_RESULT_SCHEMA_INVALID`
3. `KISMET_RESULT_POINTS_INVALID`
4. `KISMET_ROUTE_UNAVAILABLE`
5. `KISMET_AI_GENERATE_FAILED`
6. `KISMET_IMPORT_PARSE_FAILED`

## 8. 安全与隐私

1. 八字输入与分析结果默认仅本地内存/本地存储处理。
2. 不得在未经用户确认的情况下上传原始输入与结果。
3. 若启用 Runtime-AI，必须在 UI 明示将发送到的 route source（`local-runtime` 或 `token-api`）。
4. 不得在前端持久化明文第三方 API key。

## 9. 合规与外部依赖

1. 外部开源仓库仅允许抽取产品逻辑与数据契约，不允许直接复制有法律风险的实现。
2. `kismet` 上游许可证信息不完整时，默认视为"待确认"，不得直接进入官方分发。
3. 进入官方或 community 分发前必须补齐 license 审核结论。

## 10. 验收标准（必须全部满足）

1. 能力面：manifest capabilities 与源码常量一致，且通过 runtime 注册。
2. 结果面：两入口输出统一 `KismetResult`，100 年数据校验通过。
3. 失败面：任何失败返回结构化 `reasonCode + actionHint`。
4. 回退面：Runtime-AI 不可用时，显式可见地回退 `Prompt-Import`。
5. 审计面：最小审计事件集可查询、可过滤、可复现。
6. 合规面：分发前 license 风险关闭。
