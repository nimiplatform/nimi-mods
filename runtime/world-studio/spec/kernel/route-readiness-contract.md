# Route Readiness Contract

> Owner Domain: `WS-ROUTE-*`

## WS-ROUTE-001 Route Override Scope

Route overrides are stage-based (`coarse`, `fine`) and persisted per-user with a mod-local key prefix through the host-provided mod storage facade.

## WS-ROUTE-002 Route Readiness Codes

Route readiness must emit deterministic `reasonCode`, `ready`, and `actionHint`.

## WS-ROUTE-003 Phase1 Hard Gate

Phase1 cannot start when either coarse or fine effective route is unready.

## WS-ROUTE-004 Embedding Readiness Codes

Embedding readiness is evaluated separately and must expose explicit readiness reason codes.

## WS-ROUTE-005 Failed-Retry Fine Override

When failed-retry enables fine-route override, coarse and fine stages both use fine binding.
