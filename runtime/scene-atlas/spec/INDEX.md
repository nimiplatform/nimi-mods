# Scene-Atlas Spec Index

> Status: Active
> Date: 2026-03-24

## Structure

- Kernel rules: `spec/kernel/*.md`
- Fact tables: `spec/kernel/tables/*.yaml`
- Domain increments: `spec/scene-atlas.md`

## Task-Oriented Read Path

### Change scene object model or publish boundary

1. `spec/kernel/domain-contract.md`
2. `spec/kernel/tables/entities.yaml`
3. `spec/scene-atlas.md`

### Change image-to-scene workflow

1. `spec/kernel/pipeline-contract.md`
2. `spec/kernel/tables/pipeline-states.yaml`
3. `spec/scene-atlas.md`

### Change mod capability boundary

1. `spec/kernel/capability-contract.md`
2. `spec/kernel/tables/capabilities.yaml`
3. `spec/scene-atlas.md`

### Change failure mapping or readiness gate

1. `spec/kernel/error-model.md`
2. `spec/kernel/tables/reason-codes.yaml`
3. `spec/kernel/acceptance-contract.md`
4. `spec/kernel/tables/acceptance-cases.yaml`

## Verification

1. `pnpm -C nimi-mods run generate:spec`
2. `pnpm -C nimi-mods run check:spec`
