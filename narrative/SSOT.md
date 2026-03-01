---
title: Nimi Narrative Mod SSOT
status: ACTIVE
version: 2026-03-01-v3
updated_at: 2026-03-01
rules:
  - 本文件只定义 Narrative 业务边界与不变量；跨域规则与可执行合同统一下沉到 `spec/kernel/*`。
  - Narrative 是唯一叙事事实层（what happened），只产出结构化事实，不产出文本/镜头渲染结果。
  - Narrative 主链固定为 `step0(intent) -> step1(assembly) -> step2(generate) -> step3(guard) -> write-spine`。
  - CoreOutput 顶层白名单固定 `spineEvents/stateChanges/metrics`，禁止表现层字段回流。
  - NarrativeContext 作用域固定 `CANON|STORY|SUBJECT|RELATION`，仅承载叙事控制变量。
  - Narrative 读取 world+agent 语义必须经 realm 稳定边界，不得耦合 legacy 专表。
  - 项目未上线，不保留 legacy 映射层、不做双写、不做过渡壳。
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
2. Spec Kernel：跨域规则合同 + 结构化事实源（`spec/kernel/*.md` + `spec/kernel/tables/*.yaml`）。
3. Spec Domain：业务增量（`spec/narrative.md`），仅引用 kernel 规则。
4. Code：实现与测试，必须满足 Spec。

### 3.2 Spec 入口（唯一入口）

1. [spec/INDEX.md](./spec/INDEX.md)

实现与评审必须从 `spec/INDEX.md` 进入，不得绕过 kernel/table 事实源。

### 3.3 规范校验命令

1. `pnpm -C nimi-mods run generate:spec:narrative-kernel-docs`
2. `pnpm -C nimi-mods run check:spec:narrative-kernel-docs-drift`
3. `pnpm -C nimi-mods run check:spec:narrative-kernel-consistency`

## 4. 验收门槛

1. `N-PIPE-*` 的全链路状态机与 precondition 必须可执行校验。
2. `N-FACT-*` 的事实边界与白名单必须与表源一致。
3. `N-ERR-*` 的 reasonCode 必须完整、唯一、可追溯。
4. `N-ACC-*` 用例必须覆盖 approved/adjusted/rejected/context-missing/cooldown-noop。

## 5. 与其他契约关系

1. 跨 mod 编排：`ssot/mod/worldstudio-narrative-rendering.md`
2. mod 治理：`ssot/mod/governance.md`
3. realm world：`ssot/boundaries/world.md`
4. realm agent：`ssot/boundaries/agent.md`
5. textplay：`nimi-mods/textplay/SSOT.md`
6. videoplay：`nimi-mods/videoplay/SSOT.md`
