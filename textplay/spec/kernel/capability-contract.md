# Capability Contract

> Owner Domain: `T-CAP-*`

## T-CAP-001 Manifest Identity Is Fixed

`modId`, `entry`, and UI registration identity are fixed by `tables/capabilities.yaml` and must match runtime registration.

## T-CAP-002 Minimal Permission Policy

TextPlay must declare explicit minimum capability keys only. Wildcards and undeclared grants are forbidden.

## T-CAP-003 Read/Render Boundary

TextPlay reads narrative projection and route options only through declared `data.query.*` capabilities and never bypasses narrative output contracts.

## T-CAP-004 Persistence Boundary

TextPlay persistence is best-effort and limited to declared renderer-owned capability pairs (`data.register.*` + `data.query.*` under `data-api.textplay.*`).

## T-CAP-005 Capability Drift Gate

Capability changes must update table source and pass kernel consistency checks in the same change.
