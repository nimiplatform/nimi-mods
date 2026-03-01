---
title: Nimi TextPlay Mod SSOT
status: ACTIVE
version: 2026-03-01-v2
updated_at: 2026-03-01
rules:
  - 本文件只定义 TextPlay 的业务边界与不变量；可执行行为合同统一下沉到 `spec/`。
  - TextPlay 是表现层（how to present），不得创造或改写叙事事实。
  - TextPlay 只消费 Narrative 事实投影，不直连 Narrative 内部实现。
  - 渲染主链固定为 `RenderInput -> normalize/filter -> buildPrompt -> generateText -> RenderOutput`。
  - visibility 过滤与 POV 约束必须同时生效；任一失效都视为协议违规。
  - onRendered 持久化失败不得阻断渲染主链返回。
  - 不做 legacy 映射层、不做双写、不做过渡壳。
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
2. Spec：可执行契约（schema/状态机/错误码/golden）。
3. Code：实现与测试，必须满足 Spec。

### 3.2 Spec Import Index（唯一入口）

1. [spec/index.yaml](/Users/zhangkuan/Git/nimi-realm/nimi/nimi-mods/textplay/spec/index.yaml)

实现与评审必须先读取 `spec/index.yaml` imports，禁止绕过。

### 3.3 规范校验命令

1. `node /Users/zhangkuan/Git/nimi-realm/nimi/nimi-mods/scripts/check-textplay-spec.mjs`
2. `pnpm -C /Users/zhangkuan/Git/nimi-realm/nimi/nimi-mods run check:spec:textplay`

## 4. 与其他契约关系

1. Narrative：`/Users/zhangkuan/Git/nimi-realm/nimi/nimi-mods/narrative/SSOT.md`
2. VideoPlay：`/Users/zhangkuan/Git/nimi-realm/nimi/nimi-mods/videoplay/SSOT.md`
3. 跨 mod 编排：`/Users/zhangkuan/Git/nimi-realm/nimi/ssot/mod/worldstudio-narrative-rendering.md`
4. mod 治理：`/Users/zhangkuan/Git/nimi-realm/nimi/ssot/mod/governance.md`
