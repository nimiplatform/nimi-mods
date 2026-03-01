# VideoPlay Spec Index

> Status: Draft
> Date: 2026-03-01

## Structure

- Kernel rules: `spec/kernel/*.md`
- Fact tables: `spec/kernel/tables/*.yaml`
- Generated views: `spec/kernel/generated/*.md`
- Domain increments: `spec/videoplay.md`

## Task-Oriented Read Path

### Change production pipeline

1. `spec/kernel/pipeline-contract.md`
2. `spec/kernel/tables/pipeline-states.yaml`
3. `spec/videoplay.md`

### Change segmentation policy

1. `spec/kernel/segmentation-contract.md`
2. `spec/kernel/tables/segmentation-policy.yaml`
3. `spec/videoplay.md`

### Change edit compose / AV sync

1. `spec/kernel/edit-compose-contract.md`
2. `spec/kernel/tables/edit-compose-policy.yaml`
3. `spec/videoplay.md`

### Change routing and fallback

1. `spec/kernel/routing-contract.md`
2. `spec/kernel/tables/routing-stages.yaml`
3. `spec/videoplay.md`

### Change quality gates

1. `spec/kernel/quality-gate-contract.md`
2. `spec/kernel/tables/quality-gates.yaml`
3. `spec/videoplay.md`

### Change reason codes / acceptance

1. `spec/kernel/error-model.md`
2. `spec/kernel/acceptance-contract.md`
3. `spec/kernel/tables/reason-codes.yaml`
4. `spec/kernel/tables/acceptance-cases.yaml`

## Verification

1. `pnpm -C nimi-mods run generate:spec:videoplay-kernel-docs`
2. `pnpm -C nimi-mods run check:spec:videoplay-kernel-docs-drift`
3. `pnpm -C nimi-mods run check:spec:videoplay-kernel-consistency`
