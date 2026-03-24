# Scene-Atlas Domain Spec

> Status: Active
> Date: 2026-03-24
> Scope: 现实照片导入 → SceneCard 生成 → ScenePack 整理与发布交接。

## 0. Normative Imports

- Domain boundary: `kernel/domain-contract.md` (`SA-DOM-*`)
- Capability boundary: `kernel/capability-contract.md` (`SA-CAP-*`)
- Pipeline: `kernel/pipeline-contract.md` (`SA-PIPE-*`)
- Error semantics: `kernel/error-model.md` (`SA-ERR-*`)
- Acceptance gates: `kernel/acceptance-contract.md` (`SA-ACC-*`)

## 1. 产品定位

Scene-Atlas 是一个 desktop mod，用于把现实照片转成可反复消费的场景素材。

它不直接创建 canonical world，也不直接编辑 Realm `Asset` 或 `Bundle`。它负责生成和整理私有场景工作态对象，其中 `ScenePack` 是用户可感知的主要产出物，`SceneCard` 是 pack 内最小素材单元。

核心边界：

- `Scene-Atlas` 负责把现实照片变成可用的场景工作态对象
- 发布交接完成后，`SceneCard` 结果可被承载为 `Asset`，`ScenePack` 可被承载为 `Bundle`

## 2. Domain Invariants

- `SA-DOM-001`: `SceneCard` 是单图场景素材卡，在 Scene-Atlas 内不是独立发布对象。
- `SA-DOM-002`: `ScenePack` 是 Scene-Atlas 的主要产出物，也是 Scene-Atlas 内唯一允许进入发布交接的场景包容器。
- `SA-DOM-003`: `ScenePack` 和 `SceneCard` 属于 mod 私有场景工作态，不得伪装成 Realm `Asset` 或 `Bundle`。
- `SA-DOM-004`: Scene-Atlas 采用 pack-first 工作流。导入第一张图时隐式创建 `ScenePack draft`，而不是要求用户先填项目表单。
- `SA-DOM-005`: 同一个 `ScenePack` 内的 `SceneCard` 必须共享同一个 `defaultStyle`。风格身份在首次成功生成后确定，并在 pack 拥有任意 `SceneCard` 时锁定。
- `SA-DOM-006`: `ScenePack` 的就绪性由系统自动派生，使用 `isReady + readinessIssues[]` 表达，不依赖用户手动标记 ready。
- `SA-DOM-007`: `ScenePack` 中的 `SceneCard` 为有序序列，该顺序具有展示和叙事语义，下游消费必须保留顺序。
- `SA-DOM-008`: 已发布的 `ScenePack` 仍可继续编辑，但编辑对象始终是 `ScenePack`，不是上层 `Bundle`。

## 3. Domain Increments

### 3.1 Scene Objects

完整实体定义见 [`kernel/domain-contract.md`](kernel/domain-contract.md)，字段事实源见 [`kernel/tables/entities.yaml`](kernel/tables/entities.yaml)。

| Rule ID | 实体 | 说明 |
|---------|------|------|
| `SA-DOM-001` | `SceneCard` | 单张主体图为核心的场景素材卡 |
| `SA-DOM-002` | `ScenePack` | 一组按顺序组织的 SceneCard 集合 |
| `SA-DOM-003` | scene working state / Realm publish boundary | `ScenePack` / `SceneCard` 是私有场景工作态，不是 Realm `Asset` 或 `Bundle` |

### 3.2 Style and Readiness

| Rule ID | 规则 | 说明 |
|---------|------|------|
| `SA-DOM-004` | implicit draft pack | 第一张图导入时隐式创建 pack |
| `SA-DOM-005` | pack-level style lock | pack 风格在首次成功生成后确定并锁定 |
| `SA-DOM-006` | derived readiness | readiness 是自动计算而非手动状态 |
| `SA-DOM-007` | ordered scene sequence | pack 内顺序具有语义意义 |

### 3.3 Publish Handoff

| Rule ID | 规则 | 说明 |
|---------|------|------|
| `SA-DOM-008` | editable scene pack after publish | 发布后继续编辑的是 `ScenePack` |

## 4. Cross-Repo Boundaries

- Desktop host 边界遵循 `nimi/spec/desktop/kernel/hook-capability-contract.md` 与 `nimi/spec/desktop/kernel/mod-governance-contract.md`。
- Mod SDK 边界遵循 `nimi/spec/sdk/mod.md` 与 `nimi/spec/sdk/kernel/mod-contract.md`。
- Realm `asset` 语义遵循 `nimi/spec/realm/kernel/asset-contract.md` 与 `nimi-realm/spec/realm/kernel/asset-contract.md`。

## 5. Non-goals

- 不做批量修图工作台。
- 不做 Photoshop 式局部编辑器。
- 不做 canonical world authoring。
- 不做 `SceneCard` 级别的独立发布。
- 不在 mod 内定义市场 listing、定价、授权和流通规则。
