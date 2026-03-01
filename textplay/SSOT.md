---
title: Nimi TextPlay Mod SSOT
status: ACTIVE
version: 2026-03-01-v3
updated_at: 2026-03-01
rules:
  - 本文件只定义 TextPlay 业务边界与不变量；跨域规则与可执行合同统一下沉到 `spec/kernel/*`。
  - TextPlay 是表现层（how to present），不得创造或改写叙事事实。
  - TextPlay 只消费 Narrative 事实投影，不直连 Narrative 内部实现。
  - 渲染主链固定为 `received -> normalize -> filter-visibility -> build-prompt -> generate -> wrap-output -> persist-best-effort`。
  - visibility 过滤与 POV 约束必须同时生效；任一失效都视为协议违规。
  - onRendered 持久化失败不得阻断渲染主链返回。
  - 项目未上线，不保留 legacy 映射层、不做双写、不做过渡壳。
---

# Nimi TextPlay 唯一真相（SSOT）

## 1. 目标与定位

TextPlay 是 nimi 生态的文本表现层，负责：

1. 消费 Narrative 结构化事实输入（RenderInput）。
2. 应用 visibility/POV 规则构建渲染 prompt。
3. 生成沉浸文本输出（RenderOutput）及可观测元数据。
4. 维护可驱动 Narrative Initiative 的 Presence 状态机。

TextPlay 不负责：

1. 事实生成与守卫（归 Narrative）。
2. world/agent 事实资产维护（归 realm + world-studio）。
3. 视频分镜、渲染和剪辑（归 videoplay）。

## 2. 事实层边界（冻结）

1. narrative：唯一叙事事实输入层。
2. textplay：文本表现层，不回写 narrative spine。

## 3. SSOT -> Spec -> Code 映射

### 3.1 规范层级

1. SSOT：边界、原则、不变量（本文件）。
2. Spec Kernel：跨域规则合同 + 结构化事实源（`spec/kernel/*.md` + `spec/kernel/tables/*.yaml`）。
3. Spec Domain：业务增量（`spec/textplay.md`），仅引用 kernel 规则。
4. Code：实现与测试，必须满足 Spec。

### 3.2 Spec 入口（唯一入口）

1. [spec/INDEX.md](./spec/INDEX.md)

实现与评审必须从 `spec/INDEX.md` 进入，不得绕过 kernel/table 事实源。

### 3.3 规范校验命令

1. `pnpm -C nimi-mods run generate:spec:textplay-kernel-docs`
2. `pnpm -C nimi-mods run check:spec:textplay-kernel-docs-drift`
3. `pnpm -C nimi-mods run check:spec:textplay-kernel-consistency`

## 4. 验收门槛

1. `T-PIPE-*` 渲染链路必须完整通过状态机校验。
2. `T-VIS-*` 与 `T-PRES-*` 规则必须同时生效并可测。
3. `T-ERR-*` reasonCode 集合必须完整、唯一、可追溯。
4. `T-ACC-*` 用例必须覆盖 render/filter/persistence/presence 关键行为。

## 5. 与其他契约关系

1. Narrative：`nimi-mods/narrative/SSOT.md`
2. VideoPlay：`nimi-mods/videoplay/SSOT.md`
3. 跨 mod 编排：`ssot/mod/worldstudio-narrative-rendering.md`
4. mod 治理：`ssot/mod/governance.md`
