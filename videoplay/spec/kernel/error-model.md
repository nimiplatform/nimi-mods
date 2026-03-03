# Error Model

> Owner Domain: `V-ERR-*`

## V-ERR-001 ReasonCode Source

`tables/reason-codes.yaml` is the only source of VideoPlay reason codes.

## V-ERR-002 Blocking Error Requirement

Blocking reason codes must provide actionable `actionHint`.

## V-ERR-003 Warning Error Requirement

Warning reason codes cannot mask blocking failures in release gate path.

## V-ERR-004 Story Source Blocking Errors

Invalid story package payload or unavailable story source must return blocking reason codes and explicit action hints.

## V-ERR-005 Checkpoint Resume Blocking Errors

Invalid checkpoint payload or resume hash mismatch must be treated as blocking failures and require rerun from an explicit stage.

## V-ERR-006 Render Orchestration Blocking Errors

Asset analysis/queue orchestration errors and required voice rendering failures are blocking errors for release path.

## V-ERR-007 Workbench Stage Blocking Errors

Stage precondition miss and explicit advance violation must return blocking reason codes and action hints that indicate required upstream stage/output fixes.
