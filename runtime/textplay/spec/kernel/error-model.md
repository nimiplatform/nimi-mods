# Error Model

> Owner Domain: `T-ERR-*`

## T-ERR-001 ReasonCode Source

`tables/reason-codes.yaml` is the only source of TextPlay reason codes.

## T-ERR-002 Blocking Error Requirements

Blocking reason codes must carry actionable `actionHint`.

## T-ERR-003 Non-Blocking Warning Requirements

Non-blocking warnings cannot change successful render output shape.
