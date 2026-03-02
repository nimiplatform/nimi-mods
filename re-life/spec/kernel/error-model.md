# Error Model

> Owner Domain: `RL-ERR-*`

## RL-ERR-001 Reason Code Source

Reason code registry is authoritative in `tables/reason-codes.yaml`.

## RL-ERR-002 Structured Envelope

Failures must expose parseable `reasonCode + actionHint`.

## RL-ERR-003 Fail-Close Boundaries

Invalid decision graph or anonymization failures must fail-close.
