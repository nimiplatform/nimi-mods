# Pipeline Contract

> Owner Domain: `V-PIPE-*`

## V-PIPE-001 Execution Chain

Execution chain is fixed:

`narrative-ingest -> episode-segmentation -> screenplay -> storyboard -> asset-render -> edit-compose -> qc-gate -> release-package`

## V-PIPE-002 Ordered Preconditions

Each state precondition is explicit and stage skipping is forbidden.

## V-PIPE-003 QC Outcome Gate

`qc-gate` outcomes are `APPROVED|ADJUSTED|REJECTED`.

## V-PIPE-004 Release Gate

Release package is allowed only for `APPROVED` or `ADJUSTED`.

## V-PIPE-005 Reject Terminal

`REJECTED` is terminal and blocks release package creation.

## V-PIPE-006 Idempotent Writes

All write operations require idempotency key and replay-safe side effects.

## V-PIPE-007 Story Source Resolve in Narrative-Ingest

`narrative-ingest` must resolve `canonical-story|textplay-enriched-story` and validate story package readiness before segmentation. Unresolved source mode is fail-close.

## V-PIPE-008 Checkpointed Stage Execution

Pipeline execution must support stage checkpoints. Each step must persist resumable metadata (`checkpointToken`, `stepInputHash`, `lastCompletedUnit`) so run state can pause and continue without replaying completed work.

## V-PIPE-009 Continue From Checkpoint Determinism

`continue-from-checkpoint` must resume from the next pending stage only. If `stepInputHash` mismatch is detected, execution must fail-close and block continuation.

## V-PIPE-010 Rerun-Step Downstream Invalidation

`rerun-step` must invalidate all downstream stage outputs and recompute from the selected stage using a higher attempt index, while preserving previous attempt audit events.

## V-PIPE-011 Attempt Policy and Retry Class

Each stage attempt must be auditable and monotonic (`attempt=1..n`). Retry is allowed only for `retryable` failures and must keep original failure events.

## V-PIPE-012 Cancel Semantics

When cancel is requested, pipeline must transition to terminal canceled state and emit `run.canceled`. Cancel path must not be rewritten as `run.error`.

## V-PIPE-013 Editable Stage Gates

VideoPlay workbench must expose editable handoff points between stages so creator can inspect and adjust outputs before advancing to the next stage.

## V-PIPE-014 Asset Analysis Subflow

`asset-render` must start from deterministic asset analysis (`shot complexity`, `required modalities`, `voice line plan`) derived from storyboard/screenplay inputs.

## V-PIPE-015 Batch and Queue Orchestration

`asset-render` must use auditable batch/queue orchestration with explicit queue item lifecycle (`QUEUED|RUNNING|SUCCEEDED|FAILED|SKIPPED`) and per-batch summary.

## V-PIPE-016 Voice Rendering in Render Stage

When asset analysis marks voice modality as required, `asset-render` must run speech synthesis through runtime route contracts and include voice coverage metrics for downstream QC.

## V-PIPE-017 Voice-First Industrial Subflow

Within `asset-render`, voice-related execution order is fixed:

`voice-analyze -> voice-render -> lip-sync -> video-render`

No step may render final shot video for a voice-required shot before its voice asset and lip-sync anchors are ready.
