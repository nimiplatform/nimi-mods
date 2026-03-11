# Run Orchestration Contract

> Owner Domain: `T-RUN-*`

## T-RUN-001 Lifecycle States

TextPlay run lifecycle states are authoritative in `tables/run-states.yaml` and must preserve terminal monotonicity.

## T-RUN-002 Event Envelope

Run and step events must carry `runId/stage/step/seq/attempt/eventType` for recovery and audit.

## T-RUN-003 Non-Blocking Persistence

`persist-best-effort` failures are warnings and cannot block successful render return.

## T-RUN-004 Resume Validation

Resume path requires checkpoint hash validation and replay-safe writes.

## T-RUN-005 Retry Classification

Retry classes are fixed to `retryable|non-retryable` and must map to explicit user action hints.

## T-RUN-006 Run/Task Identity Separation

`runId` and `taskId` are independent identities. Association must be explicit and queryable; aliasing them is forbidden.

## T-RUN-007 Cancel Terminal Semantics

Cancellation terminal event must be `run.canceled` and terminal state must be `CANCELED`. Cancellation must not be normalized into `run.error`.

## T-RUN-008 Recovery Feed Contract

Recovery must support incremental replay by `afterSeq` and must complete `gapRefill` before applying new events.
