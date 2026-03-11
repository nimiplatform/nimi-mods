# Mint-You Spec Index

> Status: Draft
> Date: 2026-03-04

## Structure

- Kernel rules: `spec/kernel/*.md`
- Fact tables: `spec/kernel/tables/*.yaml`
- Generated views: `spec/kernel/generated/*.md`
- Domain increments: `spec/mint-you.md`

## Task-Oriented Read Path

### Change pipeline

1. `spec/kernel/pipeline-contract.md`
2. `spec/kernel/tables/pipeline-states.yaml`
3. `spec/mint-you.md`

### Change capability boundary

1. `spec/kernel/capability-contract.md`
2. `spec/kernel/tables/capabilities.yaml`
3. `spec/mint-you.md`

### Change intake scenarios

1. `spec/kernel/intake-contract.md`
2. `spec/kernel/tables/scenario-intake.yaml`
3. `spec/kernel/tables/trait-dimensions.yaml`
4. `spec/mint-you.md`

### Change profile synthesis or field provenance

1. `spec/kernel/profile-contract.md`
2. `spec/kernel/tables/field-provenance.yaml`
3. `spec/kernel/tables/trait-dimensions.yaml`
4. `spec/mint-you.md`

### Change photo trust mechanism

1. `spec/kernel/photo-contract.md`
2. `spec/kernel/tables/pipeline-states.yaml` (photo_actions section)
3. `spec/kernel/tables/reason-codes.yaml` (photo codes)
4. `spec/kernel/tables/acceptance-cases.yaml` (MY-020+)
5. `spec/mint-you.md`

### Change reason codes / acceptance

1. `spec/kernel/error-model.md`
2. `spec/kernel/acceptance-contract.md`
3. `spec/kernel/tables/reason-codes.yaml`
4. `spec/kernel/tables/acceptance-cases.yaml`

## Verification

1. `pnpm -C nimi-mods run generate:spec:mint-you-kernel-docs`
2. `pnpm -C nimi-mods run check:spec:mint-you-kernel-docs-drift`
3. `pnpm -C nimi-mods run check:spec:mint-you-kernel-consistency`
4. `pnpm -C nimi-mods run check`
