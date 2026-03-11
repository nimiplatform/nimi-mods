# Capability Contract

> Owner Domain: `WS-CAP-*`

## WS-CAP-001 Manifest Identity Is Fixed

`modId`, `entry`, `tabId`, and UI slots are fixed by table and must match runtime registration.

## WS-CAP-002 Capability List Is Explicit

World-Studio capabilities are explicit string keys from table source only. Wildcard grants are forbidden.

## WS-CAP-003 AI Dependencies Are Declared

`ai.consume` and required/optional AI dependencies are declared in manifest contract and must remain consistent with runtime usage.

## WS-CAP-004 Data Query Boundary Is Stable

World-Studio reads/writes world data only through declared `data.query.*` capabilities.

## WS-CAP-005 Manifest Validation Is Mandatory

Manifest shape validation must pass before runtime exposure.
