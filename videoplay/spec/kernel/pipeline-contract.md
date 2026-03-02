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
