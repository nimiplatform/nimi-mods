# Re-Life Spec Index

> Status: Draft
> Date: 2026-03-02

## Structure

- Kernel rules: `spec/kernel/*.md`
- Fact tables: `spec/kernel/tables/*.yaml`
- Generated views: `spec/kernel/generated/*.md`
- Domain increments: `spec/re-life.md`

## Task-Oriented Read Path

### Change capabilities and data boundaries

1. `spec/kernel/capability-contract.md`
2. `spec/kernel/tables/capabilities.yaml`
3. `spec/re-life.md`

### Change simulation pipeline

1. `spec/kernel/pipeline-contract.md`
2. `spec/kernel/tables/pipeline-states.yaml`
3. `spec/re-life.md`

### Change failure semantics

1. `spec/kernel/error-model.md`
2. `spec/kernel/tables/reason-codes.yaml`
3. `spec/re-life.md`

### Change acceptance gates

1. `spec/kernel/acceptance-contract.md`
2. `spec/kernel/tables/acceptance-cases.yaml`

## Verification

1. `pnpm -C nimi-mods run generate:spec:re-life-kernel-docs`
2. `pnpm -C nimi-mods run check:spec:re-life-kernel-docs-drift`
3. `pnpm -C nimi-mods run check:spec:re-life-kernel-consistency`
