# TextPlay Spec Index

> Status: Draft
> Date: 2026-03-01

## Structure

- Kernel rules: `spec/kernel/*.md`
- Fact tables: `spec/kernel/tables/*.yaml`
- Generated views: `spec/kernel/generated/*.md`
- Domain increments: `spec/textplay.md`

## Task-Oriented Read Path

### Change render pipeline

1. `spec/kernel/pipeline-contract.md`
2. `spec/kernel/tables/pipeline-states.yaml`
3. `spec/textplay.md`

### Change capability boundary

1. `spec/kernel/capability-contract.md`
2. `spec/kernel/tables/capabilities.yaml`
3. `spec/textplay.md`

### Change run orchestration / resume recovery

1. `spec/kernel/run-orchestration-contract.md`
2. `spec/kernel/tables/run-states.yaml`
3. `spec/textplay.md`

### Change visibility/POV policy

1. `spec/kernel/visibility-pov-contract.md`
2. `spec/kernel/tables/visibility-policies.yaml`
3. `spec/textplay.md`

### Change fact projection

1. `spec/kernel/fact-projection-contract.md`
2. `spec/kernel/tables/projection-mapping.yaml`
3. `spec/textplay.md`

### Change presence state machine

1. `spec/kernel/presence-contract.md`
2. `spec/kernel/tables/presence-transitions.yaml`
3. `spec/textplay.md`

### Change reason codes / acceptance

1. `spec/kernel/error-model.md`
2. `spec/kernel/acceptance-contract.md`
3. `spec/kernel/tables/reason-codes.yaml`
4. `spec/kernel/tables/acceptance-cases.yaml`

### Change desktop host / page shell integration

1. `spec/kernel/acceptance-contract.md`
2. `spec/kernel/tables/acceptance-cases.yaml`
3. `spec/textplay.md`

## Verification

1. `pnpm -C nimi-mods run generate:spec:textplay-kernel-docs`
2. `pnpm -C nimi-mods run check:spec:textplay-kernel-docs-drift`
3. `pnpm -C nimi-mods run check:spec:textplay-kernel-consistency`
4. `pnpm -C nimi-mods --filter @nimiplatform/mod-textplay run test:smoke`
