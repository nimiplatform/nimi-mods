---
title: Nimi VideoPlay Mod SSOT
status: ACTIVE
version: 2026-03-01-v5
updated_at: 2026-03-01
rules:
  - 本文件只定义 VideoPlay 业务边界与不变量；跨域规则与可执行合同统一下沉到 `spec/kernel/*`。
  - realm world+agent 是唯一基础事实源；Narrative 是唯一叙事事实层；VideoPlay 只消费叙事事实投影。
  - VideoPlay 与 textplay 必须共享 Narrative canonical `CoreOutput` 事实流，禁止双事实链分叉。
  - VideoPlay 目标是分集短剧生产，不是单回合播放器；产线固定为分段生成 + 剪辑合成。
  - 模型能力必须来自 runtime route/capability；mod 不得内置直连厂商 API。
  - 项目未上线，不保留 legacy 兼容层、不做双写、不做过渡壳。
---

# Nimi VideoPlay 唯一真相（SSOT）

## 1. 目标与定位

VideoPlay 是 nimi 生态内的短剧生产 mod，目标产出为可分集发布的短剧包：

1. 最终产出为分集可发布内容。
2. 生产方式是分段生成 clip/shot，再剪辑合成 episode。
3. 渲染能力通过 runtime 编排提供，由 runtime 统一治理。

## 2. 事实层边界（冻结）

1. `realm`：唯一基础事实源（world+agent 数据资产）。
2. `narrative`：唯一叙事事实层（turn 级 `CoreOutput`）。
3. `videoplay`：表现层生产器，只消费事实投影，不回写事实层。

## 3. 最终交付形态（冻结）

VideoPlay 交付单位固定为 `Episode ReleasePackage`，最小集必须包含：

1. `episodeMasterVideo`
2. `episodePoster`
3. `episodeCaptionTrack`
4. `episodeMetadata`
5. `episodeTraceBundle`

## 4. SSOT -> Spec -> Code 映射

### 4.1 规范层级

1. SSOT：边界、原则、不变量（本文件）。
2. Spec Kernel：跨域规则合同 + 结构化事实源（`spec/kernel/*.md` + `spec/kernel/tables/*.yaml`）。
3. Spec Domain：业务增量（`spec/videoplay.md`），仅引用 kernel 规则。
4. Code：实现与测试，必须满足 Spec。

### 4.2 Spec 入口（唯一入口）

1. [spec/INDEX.md](./spec/INDEX.md)

实现与评审必须从 `spec/INDEX.md` 进入，不得绕过 kernel/table 事实源。

### 4.3 规范校验命令

1. `pnpm -C nimi-mods run generate:spec:videoplay-kernel-docs`
2. `pnpm -C nimi-mods run check:spec:videoplay-kernel-docs-drift`
3. `pnpm -C nimi-mods run check:spec:videoplay-kernel-consistency`

## 5. 验收门槛

1. `V-PIPE-*` 产线必须完整通过状态机门禁。
2. `V-SEG-*` 切分结果必须可复现（同输入同策略同输出）。
3. `V-EDIT-*` 时间线重叠与 AV drift 超阈必须 fail-close。
4. `V-ROUTE-*` fallback 行为必须可见且可审计。
5. `V-QC-*` 质量门禁失败必须阻断 release package。
6. `V-ACC-*` 用例必须覆盖 determinism/fallback/idempotency/AV/QC 关键行为。

## 6. 与其他契约的关系

1. 跨 mod 编排：`ssot/mod/worldstudio-narrative-rendering.md`
2. mod 治理：`ssot/mod/governance.md`
3. runtime 本地路由：`ssot/runtime/local-runtime.md`
4. AI 最后一公里：`ssot/platform/ai-last-mile.md`
5. realm world：`ssot/boundaries/world.md`
6. realm agent：`ssot/boundaries/agent.md`
