# Capability Contract

> Owner Domain: `T-CAP-*`

## T-CAP-001 Manifest Identity Is Fixed

`modId`, `entry`, and UI registration identity are fixed by `tables/capabilities.yaml` and must match runtime registration.

## T-CAP-002 Minimal Permission Policy

TextPlay must declare explicit minimum capability keys only. Wildcards and undeclared grants are forbidden.

## T-CAP-003 Read/Render Boundary

TextPlay invokes Narrative-Engine through shared module API, not through cross-mod `data-api.narrative.*` calls. Narrative compile and projection read must still honor narrative output contracts.

## T-CAP-004 Persistence Boundary

TextPlay persistence is best-effort and limited to declared renderer-owned capability pairs (`data.register.*` + `data.query.*` under `data-api.textplay.*`).

## T-CAP-005 Capability Drift Gate

Capability changes must update table source and pass kernel consistency checks in the same change.
