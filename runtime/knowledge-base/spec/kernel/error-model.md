# Error Model

> Owner Domain: `KB-ERR-*`

## KB-ERR-001 Reason Code Source

Reason code registry is authoritative in `tables/reason-codes.yaml`.

## KB-ERR-002 Structured Envelope

Failures must expose parseable `reasonCode + actionHint` and stable stage labels.

## KB-ERR-003 Fail-Close Boundaries

Format unsupported, parsing failure, and embedding route unavailable are fail-close errors that halt the pipeline.

## KB-ERR-004 Non-Blocking Degradation

Query rewriting failure and empty search results are non-blocking; the pipeline continues with degraded behavior.
