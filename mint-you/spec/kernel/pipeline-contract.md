# Pipeline Contract

> Owner Domain: `MY-PIPE-*`

## MY-PIPE-001 Execution Chain

Execution chain is fixed:
`basic-info -> interest-tags -> scenarios -> trait-extract -> dna-synthesize -> preview-card -> user-confirm -> agent-create`

## MY-PIPE-002 Ordered Preconditions

Each step precondition is mandatory and skip paths are forbidden. `trait-extract` requires all scenario choices completed. `dna-synthesize` requires trait extraction output. `agent-create` requires user confirmation.

## MY-PIPE-003 Idempotent Agent Creation

Agent creation is idempotent per intake session. Re-confirming the same persona card does not create duplicate agents. The idempotency key is `mint-you:${userId}:${sessionId}`.

## MY-PIPE-004 Session Persistence

Intake progress is persisted per step. Users can resume an interrupted intake session from the last completed step.

## MY-PIPE-005 World Selection Gate

`agent-create` step requires a valid `worldId`. World selection may happen at any point before confirmation but must be resolved before the create call.
