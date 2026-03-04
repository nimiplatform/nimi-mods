# Pipeline Contract

> Owner Domain: `MY-PIPE-*`

## MY-PIPE-001 Creation Execution Chain

Creation execution chain is fixed:
`basic-info -> interest-tags -> scenarios -> trait-extract -> dna-synthesize -> preview-card -> user-confirm -> agent-create`

## MY-PIPE-002 Ordered Preconditions

Each step precondition is mandatory and skip paths are forbidden. `trait-extract` requires all scenario choices completed. `dna-synthesize` requires trait extraction output. `agent-create` requires user confirmation.

## MY-PIPE-003 Idempotent Agent Creation

Agent creation is idempotent per intake session. Re-confirming the same persona card does not create duplicate agents. The idempotency key is `mint-you:${userId}:${sessionId}`. `sessionId` is a ULID generated when the user starts a new intake flow.

## MY-PIPE-004 Session Persistence

Intake progress is persisted per step to the mod's local state store (platform-provided key-value storage scoped to userId + modId). Users can resume an interrupted intake session from the last completed step. Session data expires after 7 days of inactivity.

## MY-PIPE-005 World Selection Gate

`agent-create` step requires a valid `worldId`. World selection is presented as a dropdown within the `user-confirm` step UI, populated from `data-api.world.worlds.mine`. It must be resolved before the create call.

## MY-PIPE-006 Photo Upload Step

Photo upload is an optional action available on the `preview-card` step and also accessible post-creation from the agent management UI. Upload stores the image URL as `referenceImageUrl` on the CreateAgentDto (at creation) or via a profile update (post-creation). The photo is private-by-default per `MY-PHOTO-002`.
