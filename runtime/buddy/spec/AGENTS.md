# Buddy Spec AGENTS

> AI 代理在 `nimi-mods/runtime/buddy/spec/` 下的编辑约定。

## 权威结构

- `kernel/*.md`: Buddy 跨域合约 (`BD-*`)。
- `kernel/tables/*.yaml`: 权威事实源。
- `kernel/generated/*.md`: 从 YAML 生成的视图（只读）。
- `buddy.md`: 仅领域增量。

## 编辑规则

- 不得手动编辑 `kernel/generated/*.md`。
- 先编辑 `kernel/tables/*.yaml`，再在同一变更中对齐 kernel/domain 文档。
- 保持 no-legacy 模式，不添加兼容性垫片。

## 强制验证

1. `pnpm -C nimi-mods run generate:spec:buddy-kernel-docs`
2. `pnpm -C nimi-mods run check:spec:buddy-kernel-docs-drift`
3. `pnpm -C nimi-mods run check:spec:buddy-kernel-consistency`
