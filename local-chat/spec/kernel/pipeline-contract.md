# Pipeline Contract

> Owner Domain: `LC-PIPE-*`

## LC-PIPE-001 Text Turn Pipeline

Text turn pipeline is deterministic and auditable from input to persistence.

## LC-PIPE-002 Session Lifecycle Pipeline

Session create/switch/delete semantics must remain target-scoped and recoverable.

## LC-PIPE-003 Speech Pipeline

Speech synthesize/transcribe paths are capability-driven and route-source explicit.

## LC-PIPE-004 Diagnostics Contract

Assistant execution must emit structured turn diagnostics and audit context.

## LC-PIPE-005 Proactive Heartbeat Pipeline

Proactive contact uses deterministic heartbeat -> policy -> decision -> persist pipeline with auditable outcomes.

## LC-PIPE-006 Streaming Turn Pipeline

Text turn execution must be stream-first (`streamText`) and must emit auditable stream metrics:

1. `streamDeltaCount`
2. `streamDurationMs`
3. `segmentParseMode`

The pipeline must parse final streamed text into at most 4 segments with deterministic delay scheduling and no secondary LLM planning call.

## LC-PIPE-007 Streaming Finalize Pipeline

When sending starts, UI must insert an assistant `streaming` placeholder message. After stream completion:

1. first finalized assistant segment replaces the placeholder
2. remaining finalized segments are appended by deterministic delay scheduler
3. `streaming` kind must never be persisted in session store

On schedule cancel/context switch, only persisted finalized messages may remain.

## LC-PIPE-008 NSFW Media Guardrail Pipeline

NSFW media policy is settings + route-source gated:

1. default policy is disabled
2. enabling NSFW media only allows media path on `local-runtime`
3. non-local routes must downgrade to `local-runtime-only` policy state

Policy decision must be recorded in assistant turn diagnostics/audit metadata even when no media generation is executed.

## LC-PIPE-009 Media Delivery Pipeline

Image/video generation must follow an append-only async pipeline:

1. parse explicit user media request first (deterministic parser on current user turn)
2. run local gate before planner call (`mediaPlannerMode`, cooldown, route readiness, dependency readiness, NSFW policy)
3. call media planner only when local gate allows automatic media
4. treat literal `[[IMG:...]]` / `[[VID:...]]` as manual/dev override only, after explicit request and planner path
5. dispatch text deliveries immediately
6. append media pending or blocked delivery asynchronously without blocking text finalize
7. replace pending media with finalized image/video delivery after generation completes

Text turn success must not be blocked by media failure.

## LC-PIPE-010 Media Planner Failure Pipeline

Media planner failure must silently degrade to text-only:

1. JSON parse failure must not fail the text turn
2. planner timeout must not fail the text turn
3. planner route / model / runtime errors must not fail the text turn
4. diagnostics may record planner blocked reason, but UI must not surface technical planner errors to the user

## LC-PIPE-011 Context Assemble Pipeline

Send path must assemble a single `ContextPacket` before prompt rendering:

1. `viewerId` must be passed explicitly from page state
2. target identity must be normalized before prompt rendering
3. world context must be rendered as short text sections, not raw payload JSON
4. recent exact history must be selected by bundle, not by flat message count
5. context packet must include running summary, lexical session recall, and typed durable memory

## LC-PIPE-012 Turn Bundle Persistence Pipeline

Session truth source must persist logical conversation bundles:

1. conversation truth source is `ConversationLedger`, not `sessions.v2`
2. each user input persists as a `user` bundle
3. each assistant turn persists as a single `assistant` bundle with ordered segments
4. assistant `text / voice / image / video` all attach to the same bundle when they belong to the same turn
5. `pending` media must not enter continuity; `ready / blocked / failed` media must attach back to the assistant bundle

## LC-PIPE-013 Running Summary Pipeline

Running summary is a first-class continuity layer:

1. summary updates only cover bundles that fell out of the recent exact window
2. summary update must be asynchronous and must not block text finalize
3. summary failure must silently degrade without failing the turn
4. summary must track `relationshipState / userFactsEstablished / assistantCommitments / openLoops / sceneState`

## LC-PIPE-014 Durable Memory Write Pipeline

Durable memory must be written by typed local-chat policy:

1. durable memory write must be asynchronous and non-blocking
2. durable memory types are at least `relationship-state / user-fact / preference / boundary / assistant-commitment / open-loop`
3. slot-based memory types must use upsert + supersede semantics
4. `assistant-commitment` and `open-loop` must support active/resolved lifecycle
5. later turns must read typed durable memory from local-chat storage, not `target.payload.coreMemory/e2eMemory`
