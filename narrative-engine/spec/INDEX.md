# Narrative-Engine Spec Index

> Status: Draft
> Date: 2026-03-01

## Structure

- Kernel rules: `spec/kernel/*.md`
- Fact tables: `spec/kernel/tables/*.yaml`
- Generated views: `spec/kernel/generated/*.md`
- Domain increments: `spec/narrative-engine.md`

## Task-Oriented Read Path

### Change capability boundary

1. `spec/kernel/capability-contract.md`
2. `spec/kernel/tables/capabilities.yaml`
3. `spec/narrative-engine.md`

### Change turn pipeline

1. `spec/kernel/pipeline-contract.md`
2. `spec/kernel/tables/pipeline-states.yaml`
3. `spec/narrative-engine.md`

### Change run orchestration / resume recovery

1. `spec/kernel/run-orchestration-contract.md`
2. `spec/kernel/tables/run-states.yaml`
3. `spec/narrative-engine.md`

### Change fact boundary / output whitelist

1. `spec/kernel/fact-layer-contract.md`
2. `spec/kernel/tables/fact-layers.yaml`
3. `spec/narrative-engine.md`

### Change context assembly

1. `spec/kernel/context-assembly-contract.md`
2. `spec/kernel/tables/context-snapshot-fields.yaml`
3. `spec/narrative-engine.md`

### Change guard policies / reason codes

1. `spec/kernel/guard-contract.md`
2. `spec/kernel/error-model.md`
3. `spec/kernel/tables/guard-policies.yaml`
4. `spec/kernel/tables/reason-codes.yaml`
5. `spec/narrative-engine.md`

### Change initiative behavior

1. `spec/kernel/initiative-contract.md`
2. `spec/kernel/tables/initiative-policies.yaml`
3. `spec/narrative-engine.md`

### Change acceptance gates

1. `spec/kernel/acceptance-contract.md`
2. `spec/kernel/tables/acceptance-cases.yaml`

## Verification

1. `pnpm -C nimi-mods run generate:spec:narrative-engine-kernel-docs`
2. `pnpm -C nimi-mods run check:spec:narrative-engine-kernel-docs-drift`
3. `pnpm -C nimi-mods run check:spec:narrative-engine-kernel-consistency`
