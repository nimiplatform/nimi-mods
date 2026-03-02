# Error Model

> Owner Domain: `KIS-ERR-*`

## KIS-ERR-001 Reason Code Source

Reason code registry is authoritative in `tables/reason-codes.yaml`.

## KIS-ERR-002 Structured Envelope

Failures must expose parseable `reasonCode + actionHint`.

## KIS-ERR-003 Fail-Close Boundaries

Invalid input/schema/points must fail-close and must not render as success.
