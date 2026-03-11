# World-Studio Spec Index

> Status: Draft
> Date: 2026-03-02

## Structure

- Kernel rules: `spec/kernel/*.md`
- Fact tables: `spec/kernel/tables/*.yaml`
- Generated views: `spec/kernel/generated/*.md`
- Domain increments: `spec/world-studio.md`

## Task-Oriented Read Path

### Change capability and manifest contract

1. `spec/kernel/capability-contract.md`
2. `spec/kernel/tables/capabilities.yaml`
3. `spec/world-studio.md`

### Change task lifecycle and single-flight rules

1. `spec/kernel/task-lifecycle-contract.md`
2. `spec/kernel/tables/task-states.yaml`
3. `spec/world-studio.md`

### Change distill pipeline and stage ordering

1. `spec/kernel/pipeline-contract.md`
2. `spec/kernel/tables/pipeline-states.yaml`
3. `spec/world-studio.md`

### Change route readiness and embedding readiness

1. `spec/kernel/route-readiness-contract.md`
2. `spec/kernel/tables/route-readiness-codes.yaml`
3. `spec/world-studio.md`

### Change quality gate behavior

1. `spec/kernel/quality-gate-contract.md`
2. `spec/kernel/tables/quality-gate-policies.yaml`
3. `spec/world-studio.md`

### Change conflict handling and reload recovery

1. `spec/kernel/conflict-recovery-contract.md`
2. `spec/kernel/tables/conflict-recovery-policy.yaml`
3. `spec/world-studio.md`

### Change reason codes / acceptance

1. `spec/kernel/error-model.md`
2. `spec/kernel/acceptance-contract.md`
3. `spec/kernel/tables/reason-codes.yaml`
4. `spec/kernel/tables/acceptance-cases.yaml`

## Verification

1. `pnpm -C nimi-mods run generate:spec:world-studio-kernel-docs`
2. `pnpm -C nimi-mods run check:spec:world-studio-kernel-docs-drift`
3. `pnpm -C nimi-mods run check:spec:world-studio-kernel-consistency`
