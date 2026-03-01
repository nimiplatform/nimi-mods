---
title: Nimi VideoPlay Mod SSOT
status: ACTIVE
version: 2026-03-01-v4
updated_at: 2026-03-01
rules:
  - 本文件只定义 VideoPlay 的业务边界与不变量；可执行行为合同统一下沉到 `spec/`。
  - realm world+agent 是唯一基础事实源；Narrative 是唯一叙事事实层；VideoPlay 只消费叙事事实投影。
  - VideoPlay 与 textplay 必须共享 Narrative canonical `CoreOutput` 事实流，禁止双事实链分叉。
  - VideoPlay 目标是分集短剧生产，不是单回合播放器；产线固定为分段生成 + 剪辑合成。
  - 模型能力必须来自 nimi runtime 提供的 route/capability；mod 不得内置直连厂商 API。
  - 不做 legacy 兼容层，不做双写，不做过渡壳。
---

# Nimi VideoPlay 唯一真相（SSOT）

## 1. 目标与定位

VideoPlay 是 nimi 生态内的短剧生产 mod，目标产出与行业成熟短剧生产链路同等级：

1. 最终产出是可分集发布到短视频平台的“有视觉吸引力短剧”。
2. 生产方式是分段生成 clip/shot，再剪辑合成 episode，不是一条长视频单次生成。
3. 渲染能力通过 runtime 编排商业模型能力（image/video/tts 等），由 runtime 统一提供。

## 2. 对标能力与差异（冻结）

对齐项：

1. 分段渲染 -> 组装剪辑 -> 分集交付。
2. script/storyboard/render/edit 的工程链路。
3. 可调用商业多模态能力达成发布级结果。

差异项（仅两类）：

1. 内容来源：VideoPlay 固定基于 world+agent+narrative 的内部原创事实流。
2. 架构要求：VideoPlay 必须满足 nimi mod/runtime 治理契约（能力声明、审计、幂等、fail-close）。

## 3. 事实层边界（冻结）

1. `realm`：唯一基础事实源（world+agent 数据资产）。
2. `narrative`：唯一叙事事实层（turn 级 `CoreOutput`）。
3. `videoplay`：表现层生产器，只消费事实投影，不回写事实层。

## 4. 最终交付形态（冻结）

VideoPlay 交付单位固定为 `Episode ReleasePackage`，最小集必须包含：

1. `episodeMasterVideo`
2. `episodePoster`
3. `episodeCaptionTrack`
4. `episodeMetadata`
5. `episodeTraceBundle`

## 5. SSOT -> Spec -> Code 映射

### 5.1 规范层级

1. SSOT：边界、原则、不变量（本文件）。
2. Spec：可执行契约（schema/状态机/阈值/错误码/golden）。
3. Code：实现与测试，必须满足 Spec。

### 5.2 Spec Import Index（唯一入口）

1. [spec/index.yaml](/Users/zhangkuan/Git/nimi-realm/nimi/nimi-mods/videoplay/spec/index.yaml)

实现与评审必须先读取 `spec/index.yaml` 的 imports，禁止绕过。

Spec 模块职责（原先分散文档已并入此结构）：

1. `episode-segmentation`：`/Users/zhangkuan/Git/nimi-realm/nimi/nimi-mods/videoplay/spec/contracts/episode-segmentation.yaml`
2. `edit-compose`：`/Users/zhangkuan/Git/nimi-realm/nimi/nimi-mods/videoplay/spec/contracts/edit-compose.yaml`
3. `golden-cases`：`/Users/zhangkuan/Git/nimi-realm/nimi/nimi-mods/videoplay/spec/golden/cases.yaml`

### 5.3 规范校验命令

1. `node /Users/zhangkuan/Git/nimi-realm/nimi/nimi-mods/scripts/check-videoplay-spec.mjs`
2. `pnpm -C /Users/zhangkuan/Git/nimi-realm/nimi/nimi-mods run check:spec:videoplay`

## 6. 与其他契约的关系

1. 跨 mod 编排：`/Users/zhangkuan/Git/nimi-realm/nimi/ssot/mod/worldstudio-narrative-rendering.md`
2. mod 治理：`/Users/zhangkuan/Git/nimi-realm/nimi/ssot/mod/governance.md`
3. runtime 本地路由：`/Users/zhangkuan/Git/nimi-realm/nimi/ssot/runtime/local-runtime.md`
4. AI 最后一公里：`/Users/zhangkuan/Git/nimi-realm/nimi/ssot/platform/ai-last-mile.md`
5. realm world：`/Users/zhangkuan/Git/nimi-realm/ssot/world.md`
6. realm agent：`/Users/zhangkuan/Git/nimi-realm/ssot/agent.md`
