# Error Model

> Owner Domain: `MY-ERR-*`

## MY-ERR-001 ReasonCode Source

`tables/reason-codes.yaml` is the only source of Mint-You reason codes.

## MY-ERR-002 Blocking Error Requirements

Blocking reason codes must carry actionable `actionHint`.

## MY-ERR-003 Non-Blocking Warning Requirements

Non-blocking warnings cannot change the persona card output shape.
