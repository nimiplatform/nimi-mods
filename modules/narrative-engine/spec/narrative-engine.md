# Narrative-Engine Domain Spec

> Status: Draft
> Date: 2026-03-02
> Scope: Narrative business increments only. Cross-domain contracts stay in kernel.

## 0. Normative Imports

- Capability boundary: `kernel/capability-contract.md` (`N-CAP-*`)
- Fact boundary: `kernel/fact-layer-contract.md` (`N-FACT-*`)
- Pipeline: `kernel/pipeline-contract.md` (`N-PIPE-*`)
- Run orchestration and recovery: `kernel/run-orchestration-contract.md` (`N-RUN-*`)
- Context assembly: `kernel/context-assembly-contract.md` (`N-CTX-*`)
- Guard and failure semantics: `kernel/guard-contract.md` + `kernel/error-model.md` (`N-GUARD-*`, `N-ERR-*`)
- Initiative policy: `kernel/initiative-contract.md` (`N-INIT-*`)
- Acceptance gates: `kernel/acceptance-contract.md` (`N-ACC-*`)

## 1. Domain Invariants

- `NAR-001`: Narrative-Engine is a shared capability module. It is not a standalone player-facing runtime mod.
- `NAR-002`: Narrative is the only narrative fact compiler. It outputs `CoreOutput`, not presentation assets.
- `NAR-003`: Narrative context carries control variables only (`CANON|STORY|SUBJECT|RELATION`), not raw realm payload.
- `NAR-004`: Narrative must fail-close on contract violations and return `reasonCode + actionHint`.
- `NAR-005`: Narrative reject path must not write spine.
- `NAR-006`: Narrative adjusted path must persist adjusted output and auditable check trace.
- `NAR-007`: Narrative run state must be resumable under checkpoint contract; terminal state cannot rollback.

## 2. Domain Increments

- `NAR-010`: Trigger source neutrality applies to `UserTurn | AgentInitiative | SystemEvent`; business logic cannot branch to bypass guard.
- `NAR-011`: TextPlay and VideoPlay load the same Narrative-Engine module contract and must observe identical reason-code semantics.
- `NAR-012`: Context assembly reads world+agent through stable realm boundaries only, then emits bounded narrative snapshot.
- `NAR-013`: Guard is mandatory even when generation quality is high; no skip path exists.
- `NAR-014`: Spine append is append-only and only allowed after `APPROVED` or `ADJUSTED`.
- `NAR-015`: Initiative cooldown hit returns non-blocking no-op with `NARRATIVE_INITIATIVE_COOLDOWN_ACTIVE`.
- `NAR-016`: Resume must validate `stepInputHash`; mismatch is fail-close.
- `NAR-017`: Step1 context assembly reads `worldEvents/lorebooks/scenes/narrative-contexts/memory` from realm boundaries and emits bounded snapshot.
- `NAR-018`: Missing `CANON/STORY` is fail-close; missing `SUBJECT/RELATION/scene` keeps run approved with coverage warnings. Event-derived player-facing story ids may resolve via a stable non-event story anchor, but cross-event context borrowing remains forbidden.
- `NAR-019`: Guard adjusts excessive tension jump with non-blocking `NARRATIVE_TENSION_JUMP_ADJUSTED`.

## 3. No Over-Design Guard

- `NAR-020`: This domain does not define renderer behavior.
- `NAR-021`: This domain does not define realm storage internals.
- `NAR-022`: This domain does not add compatibility shims.
