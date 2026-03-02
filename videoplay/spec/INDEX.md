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

### Change capability boundary

1. `spec/kernel/capability-contract.md`
2. `spec/kernel/tables/capabilities.yaml`
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

### Change creator workflow operations

1. `spec/kernel/creator-workflow-contract.md`
2. `spec/kernel/tables/creator-operations.yaml`
3. `spec/kernel/tables/rebuild-impact-matrix.yaml`
4. `spec/kernel/tables/continuity-constraints.yaml`
5. `spec/videoplay.md`

### Change version branch and lineage

1. `spec/kernel/version-lineage-contract.md`
2. `spec/kernel/tables/version-lineage-policy.yaml`
3. `spec/videoplay.md`

### Change guardrails and prompt governance

1. `spec/kernel/prompt-governance-contract.md`
2. `spec/kernel/tables/forbidden-patterns.yaml`
3. `spec/kernel/tables/prompt-canary-cases.yaml`
4. `spec/videoplay.md`

### Change reason codes / acceptance

1. `spec/kernel/error-model.md`
2. `spec/kernel/acceptance-contract.md`
3. `spec/kernel/tables/reason-codes.yaml`
4. `spec/kernel/tables/acceptance-cases.yaml`

## Verification

1. `pnpm -C nimi-mods run generate:spec:videoplay-kernel-docs`
2. `pnpm -C nimi-mods run check:spec:videoplay-kernel-docs-drift`
3. `pnpm -C nimi-mods run check:spec:videoplay-kernel-consistency`
