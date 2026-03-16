# Pipeline Contract

> Owner Domain: `MY-PIPE-*`

## MY-PIPE-001 Creation Execution Chain

Creation execution chain is fixed:
`basic-info -> interest-tags -> interview -> trait-extract -> dna-synthesize -> preview-card -> user-confirm -> agent-create`

## MY-PIPE-002 Ordered Preconditions

Each step precondition is mandatory and skip paths are forbidden. `trait-extract` requires interview completion (minimum 7 valid turns or degraded end at turn 12). `dna-synthesize` requires trait extraction output. `agent-create` requires user confirmation.

## MY-PIPE-003 Idempotent Agent Creation

Agent creation is idempotent per intake session. Re-confirming the same persona card does not create duplicate agents. The idempotency key is `mint-you:${userId}:${sessionId}`. `sessionId` is a ULID generated when the user starts a new intake flow.

## MY-PIPE-004 Session Persistence

Intake progress is persisted per step to the mod's local state store (platform-provided key-value storage scoped to userId + modId). Users can resume an interrupted intake session from the last completed step. Session data expires after 7 days of inactivity.

## MY-PIPE-005 OASIS World Binding Gate

`agent-create` step requires a valid `worldId` resolved from `data-api.world.oasis.get`. Target world is fixed to OASIS and displayed as read-only in `user-confirm`; manual world selection is forbidden.

## MY-PIPE-006 Photo Upload Step

Photo upload is an optional action available on the `preview-card` step and also accessible post-creation from the agent management UI. Upload stores the image URL as `referenceImageUrl` on the CreateAgentDto (at creation) or via a profile update (post-creation). The photo is private-by-default per `MY-PHOTO-002`.

## MY-PIPE-007 Interview Language Propagation

`dna-synthesize` and any later preview-phase re-synthesis must consume the persisted `interviewLanguage` resolved during the interview phase. Falling back to the current UI locale after interview completion is forbidden when a session-scoped interview language is already present.
