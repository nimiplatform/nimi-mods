# Cashbook Spec Index

> Status: Draft
> Date: 2026-03-04

## Structure

- Kernel rules: `spec/kernel/*.md`
- Fact tables: `spec/kernel/tables/*.yaml`
- Generated views: `spec/kernel/generated/*.md`
- Domain increments: `spec/cashbook.md`

## Task-Oriented Read Path

### Change mod identity/capabilities

1. `spec/kernel/capability-contract.md`
2. `spec/kernel/tables/capabilities.yaml`
3. `spec/cashbook.md`

### Change transaction parsing pipeline

1. `spec/kernel/pipeline-contract.md`
2. `spec/kernel/tables/pipeline-states.yaml`
3. `spec/cashbook.md`

### Change enrichment / retroactive parsing

1. `spec/kernel/enrichment-contract.md`
2. `spec/kernel/tables/enrichment-dimensions.yaml`
3. `spec/cashbook.md`

### Change failure mapping

1. `spec/kernel/error-model.md`
2. `spec/kernel/tables/reason-codes.yaml`
3. `spec/cashbook.md`

### Change acceptance gates

1. `spec/kernel/acceptance-contract.md`
2. `spec/kernel/tables/acceptance-cases.yaml`

## Verification

1. `pnpm -C nimi-mods run generate:spec:cashbook-kernel-docs`
2. `pnpm -C nimi-mods run check:spec:cashbook-kernel-docs-drift`
3. `pnpm -C nimi-mods run check:spec:cashbook-kernel-consistency`
