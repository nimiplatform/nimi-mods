# Task Lifecycle Contract

> Owner Domain: `WS-TASK-*`

## WS-TASK-001 Single-Flight Execution

At any time, at most one active task may run in workspace state.

## WS-TASK-002 Transition Graph Is Closed

Task status transitions are fixed by lifecycle table. Illegal transitions must not mutate state.

## WS-TASK-003 Task Kind Capability Matrix

Each task kind has explicit atomic/resumable/pause/cancel capabilities and default step.

## WS-TASK-004 Checkpoint Contract

Non-atomic tasks must support checkpoint updates with monotonic `checkpointVersion`.

## WS-TASK-005 Pause/Resume/Cancel Bridge

`requestPause` and `requestCancel` must bridge UI intent to runtime interrupt behavior.

## WS-TASK-006 Reload Recovery Policy

Reloaded live task becomes `PAUSED` if resumable; otherwise `FAILED` with deterministic error code.
