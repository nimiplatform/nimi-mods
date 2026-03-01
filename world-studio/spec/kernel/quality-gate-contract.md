# Quality Gate Contract

> Owner Domain: `WS-QG-*`

## WS-QG-001 Quality Metrics Schema

Quality gate computes deterministic extraction metrics from event graph and chunk outcomes.

## WS-QG-002 Threshold Policy

Block/Warn thresholds are table-driven and must stay aligned with evaluator implementation.

## WS-QG-003 Block Fail-Close

`BLOCK` result must stop synthesize progression.

## WS-QG-004 Checkpoint Refresh Re-Evaluation

Manual checkpoint edits must support recomputing quality gate from current graph state.

## WS-QG-005 Issue Catalog

Each quality issue uses explicit `(code, severity, trigger)` policy.
