# Error Model

> Owner Domain: `WS-ERR-*`

## WS-ERR-001 Reason Code Source

Reason code registry is authoritative in `tables/reason-codes.yaml`.

## WS-ERR-002 Parseable Error Prefix

Task/runtime errors must preserve machine-parseable reason code prefixes.

## WS-ERR-003 User-Facing Mapping

Route, task, quality, and conflict failures must remain mappable to user-facing summaries.

## WS-ERR-004 Fail-Close Boundaries

Invalid route, invalid event graph, or block quality gate must fail-close instead of degraded publish.
