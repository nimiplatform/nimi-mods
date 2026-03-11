# Kismet Spec Index

> Status: Draft
> Date: 2026-03-02

## Structure

- Kernel rules: `spec/kernel/*.md`
- Fact tables: `spec/kernel/tables/*.yaml`
- Generated views: `spec/kernel/generated/*.md`
- Domain increments: `spec/kismet.md`

## Task-Oriented Read Path

### Change mod identity/capabilities

1. `spec/kernel/capability-contract.md`
2. `spec/kernel/tables/capabilities.yaml`
3. `spec/kismet.md`

### Change dual-entry generation pipeline

1. `spec/kernel/pipeline-contract.md`
2. `spec/kernel/tables/pipeline-states.yaml`
3. `spec/kismet.md`

### Change failure mapping

1. `spec/kernel/error-model.md`
2. `spec/kernel/tables/reason-codes.yaml`
3. `spec/kismet.md`

### Change acceptance gates

1. `spec/kernel/acceptance-contract.md`
2. `spec/kernel/tables/acceptance-cases.yaml`

## Verification

1. `pnpm -C nimi-mods run generate:spec:kismet-kernel-docs`
2. `pnpm -C nimi-mods run check:spec:kismet-kernel-docs-drift`
3. `pnpm -C nimi-mods run check:spec:kismet-kernel-consistency`
