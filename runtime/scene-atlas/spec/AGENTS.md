# Scene-Atlas Spec AGENTS

> 在 `nimi-mods/runtime/scene-atlas/spec/` 下工作的 AI agent 约定。

## 权威结构

- `kernel/*.md`：Scene-Atlas 跨领域契约，Rule ID 前缀 `SA-*`。
- `kernel/tables/*.yaml`：权威事实源。字段、步骤、能力、错误码和验收用例必须先写入 YAML，再由 `.md` 引用。
- `scene-atlas.md`：领域文档（产品定位、核心边界、功能域、非目标、集成关系）。

## Rule ID 命名规则

| 前缀 | 所属文件 |
|------|---------|
| `SA-DOM-*` | `kernel/domain-contract.md` |
| `SA-CAP-*` | `kernel/capability-contract.md` |
| `SA-PIPE-*` | `kernel/pipeline-contract.md` |
| `SA-ERR-*` | `kernel/error-model.md` |
| `SA-ACC-*` | `kernel/acceptance-contract.md` |

## 编辑规则

- 先修改 `kernel/tables/*.yaml`，再对齐 kernel/domain 文档，保持同一次变更。
- 不允许在 `.md` 中重复定义已在 YAML 中定义的字段或枚举值，引用即可。
- 不允许把 `material`、`asset`、`listing` 混成一个对象；`Scene-Atlas` 只定义 `material` 侧业务，不定义 `Asset-Market` 市场对象。
- 不允许把 Realm `asset` 语义提前下沉到 `SceneCard` 或 `MaterialPack`；Scene-Atlas 必须停留在 mod 私有工作态与显式发布交接边界。

## 建议验证

当修改本目录 spec 文件时：

1. 确认 `SA-*` Rule ID 在 `scene-atlas.md` 中有引用或映射说明。
2. 确认 `kernel/tables/*.yaml` 中的 `source_rule` 指向有效 Rule ID。
3. 确认 `kernel/tables/capabilities.yaml` 与预期 mod/runtime 边界一致，不跨越 `sdk/mod` 和 Realm 资产边界。
