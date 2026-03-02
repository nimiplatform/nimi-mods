# Guard Contract

> Owner Domain: `N-GUARD-*`

## N-GUARD-001 Whitelist Enforcement

Top-level whitelist on `CoreOutput` is mandatory.

## N-GUARD-002 Visibility Fail-Close

Invalid visibility rejects execution.

## N-GUARD-003 Event Count Policy

Underflow rejects. Overflow is adjusted via truncate.

## N-GUARD-004 Metrics Range

Metrics ranges are enforced and out-of-range values reject.

## N-GUARD-005 Unsupported Event Handling

Unsupported spine event type or empty payload rejects.

## N-GUARD-006 Adjustment Traceability

Adjusted output must include adjustment reason and replace raw output in commit path.
Tension-delta overflow is adjusted with non-blocking reason code semantics.
