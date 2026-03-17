# Pipeline Contract

> Owner Domain: `WS-PIPE-*`

## WS-PIPE-001 Landing Modes

Landing mode enum is fixed: `NO_ACCESS | CREATE | MAINTAIN`.

## WS-PIPE-002 Create Step Chain

Create chain is fixed and ordered:

`SOURCE -> INGEST -> EXTRACT -> CHECKPOINTS -> SYNTHESIZE -> DRAFT -> PUBLISH`

## WS-PIPE-003 Distill Stage Chain

Distill stage chain is fixed and ordered:

`INGEST -> COARSE -> FINE -> MERGE -> CHECKPOINTS -> SYNTHESIZE -> DRAFT -> PUBLISH`

## WS-PIPE-004 Phase1 Retry Semantics

Phase1 supports full rerun and failed-subset rerun with logical chunk index mapping.

## WS-PIPE-005 Phase2 Preconditions

Phase2 requires valid start-time projection, non-empty selected characters, non-empty primary events, and non-block quality gate.
The evidence gate applies only to `PRIMARY` events whose `eventHorizon != FUTURE`.

## WS-PIPE-006 Maintain Operations

Maintain operations are explicit (`save-maintenance`, `sync-events`, `sync-lorebooks`, `reload-remote`) and run under task control.

## WS-PIPE-007 Publish Projection Path

Publish requires saved draft id and transitions landing target to `MAINTAIN`; agent sync ownership is `WORLD_OWNED`.

## WS-PIPE-008 Narrative Handoff Projection

Published world projection must include a narrative-consumable handoff bundle (event identity, temporal anchor, trace binding). Missing handoff bundle is fail-close.

## WS-PIPE-009 Story Projection Summary

Publish must upsert story projection contexts derived from `PRIMARY` events and expose summary metrics in maintenance diagnostics.

## WS-PIPE-010 Fine Delta-Editor Contract

`fine` is a delta editor, not a chunk-level full-draft writer.
Partial patch and no-op patch are both valid outcomes.
Omitted fields mean `no-op`, not blanking or deletion.
`fine` top-level output remains only `extraction + draftPatch`.
Natural-language deltas live inside `draftPatch.worldProse` and `draftPatch.agentProse`, each field using `{ content, confidence, evidenceRefs? }`.
The model does not decide `working prose` vs `candidate pool`; program logic routes each prose patch by fixed admission rules.
`working prose` admits only high-confidence, evidenced edits; weaker but still meaningful edits fall back to bounded candidate pools.
Candidate pools remain program-governed via `create | revise | replace | no-op`.
`accumulatorSlice` injected into `fine` includes current `working prose` but excludes prose candidate pools.

## WS-PIPE-011 Phase2 Three-Round Closure

`phase2` is purpose-split, not content-split:

- `produce`: emit a complete initial draft from graph + accumulator, using `working prose` as the primary prose seed and candidate pools only as secondary backfill/correction input
- `enrich`: emit a sparse patch for weak or missing fields only
- `audit`: emit the publish-ready final draft after consistency and contract review

World and agent outputs stay coupled inside the same round set to preserve shared style and setting coherence.
Prose input priority is fixed: `working prose > candidate pool > model gap fill`.
Round3 closure must write final audited prose back into `working prose`.
Round2 patch merge is additive by default: sparse list/array fields must merge into stable existing state by identity when possible, not wholesale replace already-stable arrays just because an incoming list is non-empty.

## WS-PIPE-012 Weak-Field Report Contract

The weak-field report is generated programmatically before phase2 enrich round.
It does not rely on model self-judgment.
Current fixed thresholds are:

- prose fields: `< 50` chars => `low_information`
- structural summary fields: `< 30` chars => `low_information`
- list fields: `< 2` items => `low_information`
- missing/null/empty => `empty`
- missing evidence coverage => `low_evidence`
- unresolved world/agent/event references => `incomplete_reference`

## WS-PIPE-013 Stage-Local Retry Contract

Coarse, fine, and each phase2 round may perform one stage-local transient retry for timeout/internal provider failures.
Timeout-like or JSON-object parse failure may trigger compact retry within the existing phase ladder.
No outer duplicate retry wrapper is introduced around those ladders.

## WS-PIPE-014 Realm-Aligned Final Draft Contract

Phase2 final output is fail-close to realm truth:

- `world` must align to `WorldPatchDto`
- `worldview` must align to `WorldviewPatchDto`
- `agentDrafts` must align to canonical creator-agent payload fields

This refactor does not alter `narrativeArc` ownership or construction; it remains a phase1 global-refine product derived from `knowledgeGraph.events.primary`.

## WS-PIPE-015 Phase1 Temporal Normalization Contract

After phase1 global refine and before quality gate / start-time derivation, world-studio must run a formal temporal normalization pass.
The pass reuses existing temporal-order logic and writes the resulting order back into graph truth:

- reorder `events.primary + events.secondary`
- rewrite contiguous integer `timelineSeq`
- rebuild canonical `timeline` from normalized primary events
- feed both quality gate and start-time option derivation from the normalized graph

Temporal normalization is a graph-level truth rewrite, not a UI-only or start-time-only projection.

## WS-PIPE-016 Generate Degraded-Enrich Contract

Generate is world-cut-first.

- `round1-produce` failure => generate fails
- `round2-enrich` failure => mark `enrichDegraded = true`, continue to `round3-audit` with round1 output
- `round3-audit` failure => generate fails

When `enrichDegraded = true`, round3 must receive explicit degraded context:

- empty or thin fields are treated as “not yet rich enough”, not as consistency failures
- `weakFieldReport` becomes advisory only
- audit scope stays limited to consistency, realm whitelist, and basic tone/style unification

If round3 succeeds under degraded mode, creator must be routed to Review with explicit warning and allowed to manually edit before deciding whether to continue creating/publishing the world.

The degraded result must also persist as draft-quality state in the draft snapshot:

- `worldCutStatus = ready`
- `enrichStatus = incomplete`
- `enrichFailureReason`
- advisory `weakFieldIssues`

This state is informational, not blocking. It must survive reload/re-entry, remain visible during Review, and be cleared or superseded only by a later successful Generate result.
Starting a new Generate attempt must not clear an existing degraded draft-quality state up front; if the new attempt fails, the prior persisted quality state remains the last known truth for that draft.
