# World-Studio Domain Spec

> Status: Draft
> Date: 2026-03-14
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
- `WS-DOM-017`: Phase2 synthesize is a three-round closure (`produce -> enrich -> audit`); timeout-like or JSON-object parse failures may fall through the existing compact retry path, while transient provider failures are retried only inside the current stage.
- `WS-DOM-018`: Publish agent sync must normalize `dnaPrimary/dnaSecondary` into backend enum domain and omit non-enum values.
- `WS-DOM-019`: Event graph, synthesize output, and event upsert payloads must preserve explicit `eventHorizon`; non-`FUTURE` `PRIMARY` events alone participate in evidence gating.
- `WS-DOM-020`: World-Studio is the sole writer of canonical `WorldEvent.timelineSeq`; publish/sync must materialize temporal-order output into contiguous integer sequence values.
- `WS-DOM-020a`: Phase1 `fine` is an incremental editor: chunk output may be partial or no-op, structural patches remain realm-aligned, and prose edits stay inside `draftPatch.worldProse / agentProse` instead of becoming a third top-level LLM channel.
- `WS-DOM-020b`: Program logic, not the model, routes prose edits into either `working prose` or bounded candidate pools; candidate operations (`create/revise/replace/no-op`) are decided programmatically.
- `WS-DOM-020c`: `buildFinalDraftAccumulatorSlice()` includes current `working prose` but excludes prose candidate pools so `fine` edits against the live prose draft without carrying candidate-pool noise.
- `WS-DOM-020ca`: `working prose` is the primary prose accumulator; candidate pools are only supplementary backfill/correction material.
- `WS-DOM-020d`: Phase2 enrich uses a program-generated weak-field report with fixed thresholds (`prose<50 chars`, `summary<30 chars`, `list<2`, plus evidence/reference gaps) and must not delegate that classification to the model.
- `WS-DOM-020da`: Phase2 `produce` must prioritize `working prose`, then candidate pools, then model gap-fill; phase2 closure writes audited prose back into `working prose`.
- `WS-DOM-020e`: Phase2 final outputs must stay inside canonical `WorldPatchDto`, `WorldviewPatchDto`, and creator-agent payload fields; any world-studio drift from realm truth is corrected in prompt, normalize, and publish shaping layers.
- `WS-DOM-020f`: Phase1 must normalize temporal order into graph truth after global refine; start-time options, quality gate, and later world-cut decisions consume the normalized graph rather than raw merge order.
- `WS-DOM-020g`: Generate is world-cut-first. If enrich fails but produce and audit succeed, creator must enter Review with explicit degraded draft-quality status and retain the ability to manually tune draft richness before choosing whether to continue creating/publishing the world.
- `WS-DOM-020ga`: Degraded enrich status is persisted as draft quality state (`worldCutStatus / enrichStatus / enrichFailureReason / weakFieldIssues`) rather than a transient warning; it survives reload and failed Generate retries, remains informational, and is superseded only by a later successful Generate result.
- `WS-DOM-024`: Maintain information architecture is fixed to four domains (`World`, `Agents`, `Assets`, `Releases`); `World` sections are `Base`, `Worldview`, `WorldEvents`, `Lorebooks`.
- `WS-DOM-025`: `world.rules` is not a world-base field; world rule editing belongs to `worldview.coreSystem.rules` in both synthesize output and maintenance editing.
- `WS-DOM-025a`: `worldview.coreSystem.rules` uses ordered rule items with fixed fields `key / title / value`; World-Studio must not degrade it back into object-map editing.
- `WS-DOM-026`: Agents V1 is metadata-first: creator-agent readable fields may be shown, metadata fields may be edited, and unsupported core persona editing must remain an explicit future capability.
- `WS-DOM-027`: Assets V1 manages `World Assets` and `Agent Assets` through canonical world `bindings` hydration and batch-upsert, without redefining backend resource contracts.
- `WS-DOM-027a`: Maintain `Base` saves creator-editable world data through world state commit only. The write identity is fixed to `targetPath = world-studio.workspace.world`, `schemaId = world-studio.workspace.state`, and `schemaVersion = 1`.
- `WS-DOM-027b`: Maintain `Worldview` is hydrated from canonical worldview truth projection. World-Studio must not reintroduce a private worldview write path or a compatibility fallback to legacy maintenance payloads.
- `WS-DOM-027c`: Maintain event sync uses world history append only. The event write identity is fixed to `eventType = WORLD_EVENT`, `schemaId = world-studio.history.append`, and `schemaVersion = 1`; delete/replace semantics are not part of V2.
- `WS-DOM-027d`: Maintain data surfaces are fixed to `state / truth / history / bindings`. Legacy `maintenance.*`, `events.*`, `resource-bindings.*`, and `mutations.*` query faces are outside the current World-Studio contract.
- `WS-DOM-028`: Successful publish lands in `MAINTAIN` and defaults the editor context to `World > Base`.
- `WS-DOM-029`: World base maintenance must consume layered world truth fields (`tagline`, `motto`, `overview`, `contentRating`) instead of limiting editing to the pre-upgrade subset.
- `WS-DOM-030`: Agents maintenance must read upgraded realm truth (`importance`, `activeWorldId`, `liveState`, `stats`) even when write support remains metadata-first.
- `WS-DOM-031`: Deprecated `timeModel.currentNode` is not a World-Studio editing surface; time-rule editing stays on `worldview.timeModel`, while `World.clockConfig` and `Worldview.languages` must remain maintainable truth modules.
- `WS-DOM-032`: World-Studio does not retain legacy top-level `world.timeFlowRatio` compatibility; all time-flow editing and projection reads use `worldview.timeModel.timeFlowRatio`.
- `WS-DOM-033`: Maintain mode must present a consistent workbench rhythm (`section navigation -> object summary -> section context -> editor surface -> contextual action bar`) across `World`, `Agents`, `Assets`, and `Releases`.
- `WS-DOM-034`: Assets maintenance must distinguish generated local assets, synced resource bindings, and missing coverage so creators can tell whether the next action is generate, link, or sync.
- `WS-DOM-035`: Releases maintenance must behave like a release surface, not a hidden transport panel; draft selection, publish entry, and mutation history must each have explicit reading context.
- `WS-DOM-035a`: Mutation history in World-Studio keeps technical fields visible, but release-facing reading context must also expose realm-authored `title / summary`.
- `WS-DOM-036`: `World.clockConfig` is a readable runtime truth surface in V2; until backend patch support exists, World-Studio must not present it as a writable Base editor field.
- `WS-DOM-037`: `narrativeArc` remains a phase1 global-refine product derived from `knowledgeGraph.events.primary`; phase2 refactor must not move or reinterpret that ownership.

## 3. No Over-Design Guard

- `WS-DOM-021`: No legacy compatibility pipeline is introduced.
- `WS-DOM-022`: No narrative/textplay/videoplay behavior contract is redefined here.
- `WS-DOM-023`: No vendor-specific route policy is introduced beyond runtime route binding contracts.
