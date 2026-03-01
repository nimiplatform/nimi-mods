---
title: Nimi Narrative Mod SSOT
status: ACTIVE
version: 2026-03-01-v2
updated_at: 2026-03-01
rules:
  - 本文件只定义 Narrative 的业务边界与不变量；可执行行为合同统一下沉到 `spec/`。
  - Narrative 是唯一叙事事实层（what happened），只产出结构化事实，不产出文本/镜头渲染结果。
  - Narrative 主链固定为 `step0(intent) -> step1(assembly) -> step2(generate) -> step3(guard) -> spine write`。
  - CoreOutput 顶层白名单固定 `spineEvents/stateChanges/metrics`，禁止表现层字段回流。
  - NarrativeContext 作用域固定 `CANON|STORY|SUBJECT|RELATION`，仅承载叙事控制变量。
  - Narrative 读取 world+agent 语义必须经 realm 稳定边界，不得耦合 legacy 专表。
  - 不做 legacy 映射层、不做双写、不做过渡壳。
---

# Nimi Narrative 唯一真相（SSOT）

## 1. 目标与定位

Narrative 是 nimi 生态的叙事事实编译层，负责：

1. 多触发源回合处理（UserTurn | AgentInitiative | SystemEvent）。
2. world+agent+narrativeContext 运行时装配。
3. 结构化事实输出（CoreOutput）与守卫裁决（CheckResult）。
4. spine append-only 写入与审计追踪。

Narrative 不负责：

1. 文本渲染（归 textplay）。
2. 视频渲染（归 videoplay）。
3. world/agent 事实资产维护（归 realm + world-studio）。

## 2. 事实层边界（冻结）

1. realm world+agent：基础事实层。
2. narrative：叙事事实层。
3. renderer（textplay/videoplay）：表现层，只消费 narrative 投影。

## 3. SSOT -> Spec -> Code 映射

### 3.1 规范层级

1. SSOT：边界、原则、不变量（本文件）。
2. Spec：可执行契约（schema/状态机/错误码/golden）。
3. Code：实现与测试，必须满足 Spec。

### 3.2 Spec Import Index（唯一入口）

1. [spec/index.yaml](/Users/zhangkuan/Git/nimi-realm/nimi/nimi-mods/narrative/spec/index.yaml)

实现与评审必须先读取 `spec/index.yaml` imports，禁止绕过。

### 3.3 规范校验命令

1. `node /Users/zhangkuan/Git/nimi-realm/nimi/nimi-mods/scripts/check-narrative-spec.mjs`
2. `pnpm -C /Users/zhangkuan/Git/nimi-realm/nimi/nimi-mods run check:spec:narrative`

## 4. 与其他契约关系

1. 跨 mod 编排：`/Users/zhangkuan/Git/nimi-realm/nimi/ssot/mod/worldstudio-narrative-rendering.md`
2. mod 治理：`/Users/zhangkuan/Git/nimi-realm/nimi/ssot/mod/governance.md`
3. realm world：`/Users/zhangkuan/Git/nimi-realm/ssot/world.md`
4. realm agent：`/Users/zhangkuan/Git/nimi-realm/ssot/agent.md`
5. textplay：`/Users/zhangkuan/Git/nimi-realm/nimi/nimi-mods/textplay/SSOT.md`
6. videoplay：`/Users/zhangkuan/Git/nimi-realm/nimi/nimi-mods/videoplay/SSOT.md`
