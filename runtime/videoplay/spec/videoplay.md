# VideoPlay Domain Spec

> Status: Draft
> Date: 2026-03-02
> Scope: Episode-scale video renderer increments only.

## 0. Normative Imports

- Capability boundary: `kernel/capability-contract.md` (`V-CAP-*`)
- Fact and traceability boundary: `kernel/fact-projection-contract.md` (`V-FACT-*`)
- Production pipeline: `kernel/pipeline-contract.md` (`V-PIPE-*`)
- Segmentation: `kernel/segmentation-contract.md` (`V-SEG-*`)
- Edit compose and AV constraints: `kernel/edit-compose-contract.md` (`V-EDIT-*`)
- Route selection and fallback audit: `kernel/routing-contract.md` (`V-ROUTE-*`)
- Quality gates: `kernel/quality-gate-contract.md` (`V-QC-*`)
- Creator workflow operations: `kernel/creator-workflow-contract.md` (`V-OPS-*`)
- Version lineage and branch audit: `kernel/version-lineage-contract.md` (`V-LINEAGE-*`)
- Prompt governance and canary: `kernel/prompt-governance-contract.md` (`V-PROMPT-*`)
- Character casting: `kernel/character-casting-contract.md` (`V-CHAR-*`)
- Scene planning: `kernel/scene-planning-contract.md` (`V-SCENE-*`)
- Candidate selection: `kernel/candidate-selection-contract.md` (`V-CAND-*`)
- Audio design: `kernel/audio-design-contract.md` (`V-AUDIO-*`)
- Error semantics and acceptance: `kernel/error-model.md`, `kernel/acceptance-contract.md` (`V-ERR-*`, `V-ACC-*`)

## 1. Domain Invariants

- `VID-001`: VideoPlay is episode production, not one-shot long video generation.
- `VID-002`: VideoPlay loads Narrative-Engine as a shared module for turn-window/projection reads and cannot rewrite narrative facts.
- `VID-003`: Every rendered unit must carry `sourceEventIds` for grounding.
- `VID-004`: Route capability is provided by runtime only; mod direct vendor API is forbidden.
- `VID-005`: Quality gate failures fail-close and block release package.
- `VID-006`: Creator operation loop must remain editable and auditable, not one-shot generation only.
- `VID-007`: VideoPlay owns `VideoStoryPackage` lifecycle and does not reuse TextPlay startup package contract.

## 2. Domain Increments

- `VID-010`: Segmentation is deterministic under same input and policy.
- `VID-011`: Edit compose forbids timeline overlap and enforces AV drift threshold.
- `VID-012`: Fallback from local to cloud must be auditable.
- `VID-013`: Same idempotency key replay cannot duplicate side effects.
- `VID-014`: Release package minimum set is mandatory for publish readiness.
- `VID-015`: Continuity rules are capability contracts and cannot be hard-bound to one UI component.
- `VID-016`: Prompt template changes must pass canary baseline before merge.
- `VID-017`: Story source mode is explicit (`canonical-story|textplay-enriched-story`) and resolved in `narrative-ingest`.
- `VID-018`: `textplay-enriched-story` requires canonical turns containing at least one `UserTurn|AgentInitiative`.
- `VID-019`: Story package assembly is fail-close; missing critical context or schema mismatch blocks pipeline.
- `VID-024`: Pipeline runtime is checkpointed and stage-resumable. `Run Pipeline` starts stage execution, `Continue` advances from next pending stage, and `Rerun Step` invalidates downstream outputs.
- `VID-025`: Stage attempts are monotonic and auditable; retry is only allowed for `retryable` failure class.
- `VID-026`: Creator can inspect and adjust stage outputs at handoff points before advancing.
- `VID-027`: Cancel semantics are terminal fail-close for the run (`run.canceled`), and must not be normalized to `run.error`.
- `VID-028`: `asset-render` includes deterministic asset analysis and auditable batch/queue orchestration, not ad-hoc per-shot dispatch.
- `VID-029`: Voice generation must use runtime speech capability and route fallback audit; no direct vendor TTS path is allowed.
- `VID-030`: Voice coverage is a mandatory QC dimension when voice modality is planned.
- `VID-031`: `asset-render` voice-required shots must follow voice-first subflow (`voice-analyze -> voice-render -> lip-sync -> video-render`) within the same stage.
- `VID-032`: Creator-side `generate-voice-line` is completed only when real `voice-audio` is produced through runtime TTS contract.
- `VID-033`: Workbench interaction must be stage-driven (`story-source -> casting -> script -> storyboard -> voice -> selection -> audio -> video -> qc -> publish`) with deterministic readiness semantics.
- `VID-034`: Stage entry preconditions are fail-close; blocked stages must emit blocking reason code and actionable hint.
- `VID-035`: Creator must be able to edit stage payloads before explicit `advance`, and downstream stages cannot auto-skip editable checkpoints.
- `VID-036`: Before rerun after stage edits, rebuild impact scope must be previewed with canonical scope vocabulary (`shot|adjacent-shots-plus-compose|clip-plus-compose|post-segmentation-full-chain`), and the manual rerun selector must expose the full canonical pipeline chain.
- `VID-037`: Desktop route registration must request `immersive` shell mode, and the source/workbench/diagnostics panes must remain side-by-side at desktop host widths so the center workbench stays primary.

## 3. No Over-Design Guard

- `VID-020`: No renderer-owned world fact persistence model is introduced.
- `VID-021`: No vendor-specific model binding is encoded in domain rules.
- `VID-022`: No compatibility fallback path is introduced.
- `VID-023`: VideoPlay must not read TextPlay private persisted run records as factual pipeline input.
