# World-Studio Domain Spec

> Status: Draft
> Date: 2026-03-02
> Scope: World-Studio business increments only.

## 0. Normative Imports

- Capability and manifest boundary: `kernel/capability-contract.md` (`WS-CAP-*`)
- Distill and create pipeline: `kernel/pipeline-contract.md` (`WS-PIPE-*`)
- Task lifecycle and single-flight: `kernel/task-lifecycle-contract.md` (`WS-TASK-*`)
- Route readiness and embedding readiness: `kernel/route-readiness-contract.md` (`WS-ROUTE-*`)
- Quality gate semantics: `kernel/quality-gate-contract.md` (`WS-QG-*`)
- Conflict reload and task recovery: `kernel/conflict-recovery-contract.md` (`WS-CONFLICT-*`)
- Error semantics: `kernel/error-model.md` (`WS-ERR-*`)
- Acceptance gates: `kernel/acceptance-contract.md` (`WS-ACC-*`)

## 1. Domain Invariants

- `WS-DOM-001`: World-Studio owns world asset creation/maintenance, not renderer behavior.
- `WS-DOM-002`: CREATE and MAINTAIN workflows are both guarded by single-flight task control.
- `WS-DOM-003`: Distill stages and create-step transitions are ordered and non-skippable.
- `WS-DOM-004`: Route readiness is required before phase1 extraction.
- `WS-DOM-005`: Quality gate `BLOCK` must stop synthesize and publish progression.

## 2. Domain Increments

- `WS-DOM-010`: Phase1 retry supports failed-subset rerun with logical chunk index mapping.
- `WS-DOM-011`: Start-time projection is non-destructive and keeps future events as projected entries.
- `WS-DOM-012`: Reload conflict action replaces local unsaved snapshot with remote authoritative snapshot.
- `WS-DOM-013`: Reload recovery converts live task to `PAUSED` or `FAILED` by resumable capability.
- `WS-DOM-014`: Publish path keeps agent sync world-owned and normalizes invalid handles.

## 3. No Over-Design Guard

- `WS-DOM-020`: No legacy compatibility pipeline is introduced.
- `WS-DOM-021`: No narrative/textplay/videoplay behavior contract is redefined here.
- `WS-DOM-022`: No vendor-specific route policy is introduced beyond runtime route binding contracts.
