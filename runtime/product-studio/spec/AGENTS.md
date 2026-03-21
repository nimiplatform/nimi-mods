# Product Studio Spec AGENTS

> 在 `nimi-mods/runtime/product-studio/spec/` 下工作的 AI agent 约定。

## 权威结构

- `kernel/*.md`：Product Studio 跨领域契约，Rule ID 前缀 `PS-*`。
- `kernel/tables/*.yaml`：权威事实源。所有契约文档中的数值性断言必须来自对应 YAML，不允许在 `.md` 中硬编码重复。
- `product-studio.md`：领域文档（产品定位、架构、功能域、非目标、UI 视图描述）。

## Rule ID 命名规则

| 前缀 | 所属文件 |
|------|---------|
| `PS-DOM-*` | `kernel/domain-contract.md` |
| `PS-PIPE-*` | `kernel/pipeline-contract.md` |
| `PS-CAP-*` | `kernel/capability-contract.md` |
| `PS-ERR-*` | `kernel/error-model.md` |
| `PS-ACC-*` | `kernel/acceptance-contract.md` |

## 编辑规则

- 先修改 `kernel/tables/*.yaml`，再对齐 kernel/domain 文档，保持同一次变更。
- 不允许在 `.md` 中重复定义已在 YAML 中定义的字段或枚举值，引用即可。
- 不允许添加兼容性 shim 或遗留模式支持代码。
- 每个新 Rule ID 必须在 `product-studio.md` 的领域概览中有对应引用。

## 必须验证

当修改任意 spec 文件时：

1. 确认所有 `PS-*` Rule ID 在 `product-studio.md` 中有索引引用。
2. 确认 `kernel/tables/*.yaml` 中的 `source_rule` 字段指向有效的 Rule ID。
3. 确认 `kernel/tables/capabilities.yaml` 的能力列表与 `mod.manifest.yaml` 保持一致。
4. 确认 `kernel/tables/reason-codes.yaml` 中每个错误码在 `kernel/error-model.md` 中有对应描述。
