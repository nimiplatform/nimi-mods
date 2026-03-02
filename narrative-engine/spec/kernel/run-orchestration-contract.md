# Run Orchestration Contract

> Owner Domain: `N-RUN-*`

## N-RUN-001 Lifecycle States

Narrative run lifecycle states are authoritative in `tables/run-states.yaml` and must include pause/resume/cancel terminal semantics.

## N-RUN-002 Event Envelope

Run and step events must use a unified envelope with `runId/stage/step/seq/attempt/eventType`.

## N-RUN-003 Checkpoint Requirements

Recoverable steps must emit `checkpointToken + stepInputHash + lastCompletedUnit`.

## N-RUN-004 Resume Validation

Resume is allowed only when `stepInputHash` matches and replay is idempotent.

## N-RUN-005 Retry Classification

Retry classes are fixed to `retryable|non-retryable`; classification must drive action hints.

## N-RUN-006 Cancel Bridge

Cancel request must propagate from UI run state to task execution state and emit terminal audit event.

## N-RUN-007 Run/Task Identity Separation

`runId` and `taskId` are independent identities. Association must be explicit and queryable; aliasing them is forbidden.

## N-RUN-008 Cancel Terminal Semantics

Cancellation terminal event must be `run.canceled` and terminal state must be `CANCELED`. Cancellation must not be normalized into `run.error`.

## N-RUN-009 Recovery Feed Contract

Recovery must support incremental replay by `afterSeq` and must complete `gapRefill` before applying new events.
