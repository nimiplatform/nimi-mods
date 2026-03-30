# Error Model

> Owner Domain: `LC-ERR-*`

## LC-ERR-001 Reason Code Source

Reason code registry is authoritative in `tables/reason-codes.yaml`.

## LC-ERR-002 Blocking vs Non-Blocking Errors

Blocking errors stop turn progression; non-blocking errors are persisted as diagnostics.

## LC-ERR-003 Parseable Error Envelope

Errors must expose parseable `reasonCode + actionHint` and stable stage labels.

## LC-ERR-004 Upstream Error Preservation

When route preflight, first-beat generation, or other runtime-backed calls fail with a structured upstream error, Local-Chat must preserve upstream `reasonCode`, `actionHint`, `traceId`, and raw cause for UI/audit projection. Local-Chat may only collapse to a local generic code such as `LOCAL_CHAT_FIRST_BEAT_UNAVAILABLE` when no more specific upstream reason is available.
