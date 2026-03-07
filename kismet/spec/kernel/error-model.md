# Error Model

> Owner Domain: `KIS-ERR-*`

## KIS-ERR-001 Structured Errors

Error codes are authoritative in `tables/reason-codes.yaml`.
All user-visible failures MUST expose `reasonCode`, `message`, and `actionHint`.

## KIS-ERR-002 Upstream Preservation

Runtime AI failures MUST preserve upstream `reasonCode` and `traceId` when provided.

## KIS-ERR-003 Fail-Close Domains

The following domains fail close:

1. birth intake validation
2. canonical profile validation
3. AI JSON schema validation
4. city resolution for location context

## KIS-ERR-004 Route Fallback

Route unavailability is not silent degradation.
It MUST surface as `KISMET_ROUTE_UNAVAILABLE` and enable prompt-import fallback for the current task.
