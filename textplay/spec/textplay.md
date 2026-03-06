# TextPlay Domain Spec

> Status: Draft
> Date: 2026-03-02
> Scope: Text renderer increments only.

## 0. Normative Imports

- Capability boundary: `kernel/capability-contract.md` (`T-CAP-*`)
- Fact projection: `kernel/fact-projection-contract.md` (`T-FACT-*`)
- Render pipeline: `kernel/pipeline-contract.md` (`T-PIPE-*`)
- Run orchestration and recovery: `kernel/run-orchestration-contract.md` (`T-RUN-*`)
- Visibility and POV: `kernel/visibility-pov-contract.md` (`T-VIS-*`)
- Presence state machine: `kernel/presence-contract.md` (`T-PRES-*`)
- Error semantics: `kernel/error-model.md` (`T-ERR-*`)
- Acceptance gates: `kernel/acceptance-contract.md` (`T-ACC-*`)

## 1. Domain Invariants

- `TXT-001`: TextPlay is a renderer. It cannot create or rewrite narrative facts.
- `TXT-002`: TextPlay loads Narrative-Engine as a shared module and performs compile + projection read in-process.
- `TXT-003`: Visibility and POV constraints are both mandatory.
- `TXT-004`: Persistence failure is non-blocking for returned render output.
- `TXT-005`: Presence transitions must emit auditable report events.
- `TXT-006`: Run recovery must preserve idempotent side effects and terminal-state monotonicity.

## 2. Domain Increments

- `TXT-010`: Input normalization runs before any visibility filter.
- `TXT-011`: Narrative compile context assembly uses TextPlay-declared world/agent read capabilities only.
- `TXT-012`: Prompt building operates only on filtered event set.
- `TXT-013`: Route-unavailable is fail-close and returns blocking reason code.
- `TXT-014`: Render output must always include `text` and `meta`.
- `TXT-015`: Initiative events reset idle/away timers in presence state machine.
- `TXT-016`: Resume with checkpoint hash mismatch is fail-close.
- `TXT-017`: Playable story catalog is derived from `data-api.world.events.list`, keeps `PRIMARY` events only, preserves upstream `eventHorizon` as canonical target-event metadata, and excludes `FUTURE` events from direct player-facing selection by default.
- `TXT-017A`: Player-facing story introduction is teaser-only: one or two background clauses with trailing ellipsis. Canonical target-event details stay in startup/prompt materials and are not fully dumped in catalog UI.
- `TXT-018`: Story startup package is assembled from world events, scenes, narrative-contexts, lorebooks, agent memory recall, and optional narrative latest turn lookup.
- `TXT-019`: Send action is blocked when no selected story or startup package is not ready.
- `TXT-023`: Story switch resets run surface state and reloads persisted records by selected story id.
- `TXT-024`: Runtime binding uses single primary agent id for turn execution and keeps other participants as context-only metadata.
- `TXT-025`: Story startup package must include `startupPolicy` and snapshot `contextCoverage/gapWarnings` diagnostics.
- `TXT-026`: Frontend auto tick may trigger `AgentInitiative` only when presence/cooldown/maxConsecutive policies are satisfied.
- `TXT-027`: Missing `CANON/STORY` context is fail-close; missing `SUBJECT/RELATION/scene` is degraded with warnings. `SUBJECT/RELATION` lookup may use exact-story match or storyless baseline only; cross-story fallback is forbidden.
- `TXT-028`: Story selection is world-scoped and requires selecting account world first.
- `TXT-029`: Fresh story requires explicit Start action that triggers one opening `SystemEvent` render before player input is accepted; fresh entry starts from the selected target event's pre-threshold rather than treating canonical event details as already happened opening facts.
- `TXT-030`: Left context panel must be independently scrollable to preserve access to session controls on small viewports.
- `TXT-031`: Tension pacing constraints are injected into render prompt based on `pacingContext.tensionBand` (HIGH/MODERATE/LOW).
- `TXT-032`: Event type rendering guidance is appended per-event as `Rendering hint` when the event carries a recognized `type` field.
- `TXT-033`: Unknown or missing event `type` degrades gracefully — no rendering hint appended, event renders with visibility tag only.

## 3. No Over-Design Guard

- `TXT-020`: No renderer-side world fact persistence contract is introduced.
- `TXT-021`: No model vendor-specific binding is introduced in domain doc.
- `TXT-022`: No fallback compatibility path is introduced.
