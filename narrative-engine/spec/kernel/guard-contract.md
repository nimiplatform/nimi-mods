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
Supported event types: `scene-beat`, `dialogue`, `action`, `state-change`, `thought`, `decision`, `discovery`, `relation-shift`, `emotion`, `observation`, `memory`, `gravity`, `timeskip`, `branch-point`, `system`.

## N-GUARD-006 Adjustment Traceability

Adjusted output must include adjustment reason and replace raw output in commit path.
Tension-delta overflow is adjusted with non-blocking reason code semantics.
