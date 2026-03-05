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
