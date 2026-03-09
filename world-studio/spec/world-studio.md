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
- `WS-DOM-011`: Start-time projection is non-destructive, keeps future events as projected FUTURE entries, and supports restoration when selecting a later start.
- `WS-DOM-012`: Reload conflict action replaces local unsaved snapshot with remote authoritative snapshot.
- `WS-DOM-013`: Reload recovery converts live task to `PAUSED` or `FAILED` by resumable capability.
- `WS-DOM-014`: Publish path keeps agent sync world-owned and normalizes invalid handles.
- `WS-DOM-015`: Maintenance diagnostics expose story projection summary (`count/missingContext/latestProjectedAt`) for narrative handoff audit.
- `WS-DOM-016`: Start-time options must prioritize temporal semantics (`timeRef`, dependency edges) over raw merge order when both are available.
- `WS-DOM-017`: Phase2 synthesize must auto-retry once with compact budget on timeout or JSON-object parse failure before surfacing an error.
- `WS-DOM-018`: Publish agent sync must normalize `dnaPrimary/dnaSecondary` into backend enum domain and omit non-enum values.
- `WS-DOM-019`: Event graph, synthesize output, and event upsert payloads must preserve explicit `eventHorizon`; non-`FUTURE` `PRIMARY` events alone participate in evidence gating.

## 3. No Over-Design Guard

- `WS-DOM-020`: No legacy compatibility pipeline is introduced.
- `WS-DOM-021`: No narrative/textplay/videoplay behavior contract is redefined here.
- `WS-DOM-022`: No vendor-specific route policy is introduced beyond runtime route binding contracts.
