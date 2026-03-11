# Daily Outfit Spec — 编写规则

> 范围: `nimi-mods/daily-outfit/spec/**` 下所有文件

## 规则 ID 前缀

| 前缀 | 领域 | 文档 |
|------|------|------|
| DO-DOM-* | 核心实体与衣橱不变量 | `kernel/domain-contract.md` |
| DO-PIPE-* | 穿搭推荐流水线 | `kernel/pipeline-contract.md` |
| DO-CAP-* | 能力与集成 | `kernel/capability-contract.md` |
| DO-ERR-* | 错误语义 | `kernel/error-model.md` |
| DO-ACC-* | 验收门 | `kernel/acceptance-contract.md` |

## 权威层次

1. **YAML 表** (`kernel/tables/*.yaml`) — 枚举、状态机、实体 schema 的唯一事实源。
2. **内核契约** (`kernel/*.md`) — 引用 YAML 表的规则文档，以 DO-* 定义业务规则。
3. **领域文档** (`*.md` 在 spec 根目录) — 薄导航层，仅引用内核 Rule ID，不定义新规则。

## 编辑规则

- 实体字段变更：先编辑 `tables/entities.yaml`，再对齐 `kernel/domain-contract.md`。
- 状态变更：先编辑 `tables/pipeline-states.yaml`，再对齐 `kernel/pipeline-contract.md`。
- 错误码变更：先编辑 `tables/reason-codes.yaml`，再对齐 `kernel/error-model.md` 及引用契约。
- 验收用例变更：先编辑 `tables/acceptance-cases.yaml`，再对齐 `kernel/acceptance-contract.md`。
- 能力变更：先编辑 `tables/capabilities.yaml`，再对齐 `kernel/capability-contract.md` 及 `mod.manifest.yaml`。
- 领域文档禁止定义新的 Rule ID 体系或契约式章节。

## 领域文档约束

领域文档 (`daily-outfit.md`) 仅作导航用途：

- 允许：定位、模块地图、阅读路径、非目标
- 禁止：`领域不变量`、`验收门`、`变更规则` 等契约式章节
- 禁止：定义新 Rule ID（只引用已有 DO-* ID）
- 禁止：复制内核契约文本

## 实现对齐

- 若实现包尚未落地，以 `spec/**` 和 `nimi-mods/package.json` 中的 spec 脚本为验证边界。
- 新增实现后，`src/types.ts` 实体结构必须匹配 `tables/entities.yaml` 字段定义。
- 新增实现后，`src/contracts.ts` 能力键必须匹配 `tables/capabilities.yaml`。
- 新增实现后，`mod.manifest.yaml` 必须与 `tables/capabilities.yaml` 对齐。

## 必须验证

1. `pnpm -C nimi-mods run generate:spec:daily-outfit-kernel-docs`
2. `pnpm -C nimi-mods run check:spec:daily-outfit-kernel-docs-drift`
3. `pnpm -C nimi-mods run check:spec:daily-outfit-kernel-consistency`
