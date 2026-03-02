# Error Model

> Owner Domain: `LC-ERR-*`

## LC-ERR-001 Reason Code Source

Reason code registry is authoritative in `tables/reason-codes.yaml`.

## LC-ERR-002 Blocking vs Non-Blocking Errors

Blocking errors stop turn progression; non-blocking errors are persisted as diagnostics.

## LC-ERR-003 Parseable Error Envelope

Errors must expose parseable `reasonCode + actionHint` and stable stage labels.
