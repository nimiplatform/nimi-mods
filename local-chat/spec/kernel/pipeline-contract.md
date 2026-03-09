# Pipeline Contract

> Owner Domain: `LC-PIPE-*`

## LC-PIPE-001 Text Turn Pipeline

Text turn pipeline is beat-first, deterministic, and auditable from input to persistence:

1. resolve turn mode before generation
2. compile one `ContextPacket` and one prompt budget before any model call
3. persist user turn immediately
4. deliver assistant first beat as a finalized message, not a placeholder
5. schedule later beats through a single delivery director

## LC-PIPE-002 Session Lifecycle Pipeline

Session lifecycle is single-thread per viewer-target relation:

1. each viewer-target pair may persist at most one recoverable session
2. target entry must auto-create or recover that sole session
3. history clear resets the active thread without introducing a second session

## LC-PIPE-003 Speech Pipeline

Speech synthesize/transcribe paths are capability-driven and route-source explicit:

1. `voiceAutonomy` is the product-scoped trigger policy and must use `off | explicit-only | natural`
2. `voiceConversationMode` is session-scoped and must use `off | on`
3. `voiceConversationMode=on` keeps subsequent non-explicit-media replies in voice until disabled
4. derived internal voice availability is `true` when `voiceAutonomy!=off` or `voiceConversationMode=on`
5. `voiceAutonomy=off` together with `voiceConversationMode=off` blocks voice input, autoplay, and voice catalog queries
6. front-end TTS must prefer `runtime.media.tts.stream` and fall back to `tts.synthesize`
7. voice beats must keep text shadow content for silent reading

## LC-PIPE-004 Diagnostics Contract

Assistant execution must emit structured turn diagnostics and audit context.

## LC-PIPE-005 Proactive Heartbeat Pipeline

Proactive contact uses deterministic heartbeat -> policy -> beat-first turn planning -> persist pipeline with auditable outcomes.

After policy allow:

1. proactive contact must use the same turn mode / first beat / turn composer / modality orchestration chain as user-initiated turns
2. proactive persistence must update interaction snapshot and relation memory using the same continuity compiler
3. proactive audit must retain deterministic policy reason codes

## LC-PIPE-006 First Beat And Turn Plan Pipeline

Successful text turns may use multiple model calls on the critical path:

1. `FirstBeatReactor` may use a short low-token text call
2. `TurnComposer` may use a second structured planning call
3. `TurnComposer` may fall back to legacy stream-text segmentation only when structured planning fails
4. the successful path MUST NOT depend on full-text generation followed by forced post-splitting

## LC-PIPE-007 Delivery Director Pipeline

Delivery director owns beat persistence and cancellation:

1. successful path has no mandatory `streaming` placeholder
2. any fallback placeholder path must replace the placeholder with the first finalized message
3. `streaming` kind must never persist in session store
4. new user input, thread reset, target switch, or route invalidation must cancel undispatched beats

## LC-PIPE-008 NSFW Media Guardrail Pipeline

NSFW media policy is settings + route-source gated:

1. default policy is disabled
2. `visualComfortLevel=natural-visuals` on `local` allows NSFW media generation
3. `visualComfortLevel=restrained-visuals | text-only` disables NSFW media generation
4. non-local routes must downgrade to `local-only` policy state

Policy decision must be recorded in assistant turn diagnostics/audit metadata even when no media generation is executed.

## LC-PIPE-009 Modality Orchestration Pipeline

Image/video/voice generation must follow one beat-level orchestration policy:

1. each beat independently selects `text | voice | image | video`
2. explicit user requests outrank automatic modality choices
3. `voiceAutonomy` and `mediaAutonomy` both use `off | explicit-only | natural` trigger semantics
4. `voiceConversationMode=on` forces non-explicit-media assistant beats to voice, but must not override explicit image/video beats
5. automatic media still passes explicit gate, cooldown, route readiness, dependency readiness, and NSFW policy
6. text beat success must not be blocked by media failure

## LC-PIPE-010 Media Planner Failure Pipeline

Media planner failure must silently degrade to text-only:

1. JSON parse failure must not fail the text turn
2. planner timeout must not fail the text turn
3. planner route / model / runtime errors must not fail the text turn
4. diagnostics may record planner blocked reason, but UI must not surface technical planner errors to the user

## LC-PIPE-011 Context Compile Pipeline

Send path must compile a single `ContextPacket` before prompt rendering:

1. `viewerId` must be passed explicitly from page state
2. target identity must be normalized before prompt rendering
3. `interactionProfile` must be derived locally from target DNA / metadata / world context
4. recent exact history must be selected by bundle, not by flat message count
5. context packet must expose `interactionSnapshot`, `relationMemorySlots`, `recallIndex`, and platform warm-start data when available

## LC-PIPE-012 Turn Bundle Persistence Pipeline

Session truth source must persist logical conversation bundles:

1. conversation truth source is `ConversationLedger`, not `sessions.v2`
2. each user input persists as a `user` bundle
3. each assistant turn persists as a single `assistant` bundle with ordered beats/segments
4. assistant `text / voice / image / video` all attach to the same bundle when they belong to the same turn
5. `pending` media must not enter continuity; `ready / blocked / failed` media must attach back to the assistant bundle

## LC-PIPE-013 Interaction Snapshot Pipeline

Conversation continuity is compiled after delivery:

1. interaction snapshot update must be asynchronous and must not block first-beat persistence
2. snapshot must track at least `relationshipState / activeScene / emotionalTemperature / assistantCommitments / userPrefs / openLoops / topicThreads / lastResolvedTurnId`
3. snapshot compiler input is exact turns/beats/media, not realm-side hidden memory payloads

## LC-PIPE-014 Relation Memory Pipeline

Target-viewer relation memory is a slot compiler, not the old typed durable-memory path:

1. relation memory writes must be asynchronous and non-blocking
2. slot types are at least `preference / boundary / rapport / promise / recurringCue / taboo`
3. recall index must refresh from exact turns/beats after snapshot compilation
4. later turns must read relation memory slots and recall index from local-chat storage, not `target.payload.coreMemory/e2eMemory`
