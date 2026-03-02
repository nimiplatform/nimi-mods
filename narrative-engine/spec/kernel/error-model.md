# Error Model

> Owner Domain: `N-ERR-*`

## N-ERR-001 ReasonCode Source

`tables/reason-codes.yaml` is the only source of narrative reason code values.

## N-ERR-002 Blocking Error Shape

Blocking reason codes must provide explicit `actionHint` for operator remediation.

## N-ERR-003 Non-Blocking Warning Shape

Non-blocking reason codes cannot hide blocking failures and must preserve successful output shape.
