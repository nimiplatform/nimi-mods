# Error Model

> Owner Domain: `V-ERR-*`

## V-ERR-001 ReasonCode Source

`tables/reason-codes.yaml` is the only source of VideoPlay reason codes.

## V-ERR-002 Blocking Error Requirement

Blocking reason codes must provide actionable `actionHint`.

## V-ERR-003 Warning Error Requirement

Warning reason codes cannot mask blocking failures in release gate path.
