# Agent-Capture Spec Index

## Read Order

1. `agent-capture.md`
2. `kernel/domain-contract.md`
3. `kernel/capability-contract.md`
4. `kernel/pipeline-contract.md`
5. `kernel/error-model.md`
6. `kernel/acceptance-contract.md`

## Kernel Tables

- `kernel/tables/entities.yaml`
- `kernel/tables/capabilities.yaml`
- `kernel/tables/pipeline-states.yaml`
- `kernel/tables/reason-codes.yaml`
- `kernel/tables/acceptance-cases.yaml`

## Verification

1. `pnpm -C nimi-mods run generate:spec:agent-capture-kernel-docs`
2. `pnpm -C nimi-mods run check:spec:agent-capture-kernel-docs-drift`
3. `pnpm -C nimi-mods run check:spec:agent-capture-kernel-consistency`
