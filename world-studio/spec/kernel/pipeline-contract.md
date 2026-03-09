# Pipeline Contract

> Owner Domain: `WS-PIPE-*`

## WS-PIPE-001 Landing Modes

Landing mode enum is fixed: `NO_ACCESS | CREATE | MAINTAIN`.

## WS-PIPE-002 Create Step Chain

Create chain is fixed and ordered:

`SOURCE -> INGEST -> EXTRACT -> CHECKPOINTS -> SYNTHESIZE -> DRAFT -> PUBLISH`

## WS-PIPE-003 Distill Stage Chain

Distill stage chain is fixed and ordered:

`INGEST -> COARSE -> FINE -> MERGE -> CHECKPOINTS -> SYNTHESIZE -> DRAFT -> PUBLISH`

## WS-PIPE-004 Phase1 Retry Semantics

Phase1 supports full rerun and failed-subset rerun with logical chunk index mapping.

## WS-PIPE-005 Phase2 Preconditions

Phase2 requires valid start-time projection, non-empty selected characters, non-empty primary events, and non-block quality gate.
The evidence gate applies only to `PRIMARY` events whose `eventHorizon != FUTURE`.

## WS-PIPE-006 Maintain Operations

Maintain operations are explicit (`save-maintenance`, `sync-events`, `sync-lorebooks`, `reload-remote`) and run under task control.

## WS-PIPE-007 Publish Projection Path

Publish requires saved draft id and transitions landing target to `MAINTAIN`; agent sync ownership is `WORLD_OWNED`.

## WS-PIPE-008 Narrative Handoff Projection

Published world projection must include a narrative-consumable handoff bundle (event identity, temporal anchor, trace binding). Missing handoff bundle is fail-close.

## WS-PIPE-009 Story Projection Summary

Publish must upsert story projection contexts derived from `PRIMARY` events and expose summary metrics in maintenance diagnostics.
