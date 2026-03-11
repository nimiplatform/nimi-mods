# Capability Contract

> Owner Domain: `N-CAP-*`

## N-CAP-001 Module Identity Is Fixed

`moduleId`, public factory API, and ownership fields are fixed by `tables/capabilities.yaml`. Narrative-Engine is a shared module, not a standalone runtime-loaded mod.

## N-CAP-002 Minimal Permission Policy

Narrative-Engine uses explicit, minimum capability keys only. Wildcards and undeclared capability grants are forbidden.

## N-CAP-003 Read Boundary

Narrative-Engine reads world and agent context only through caller-provided `data.query.*` adapters. Callers must provide route options through runtime route query. Narrative-owned read surfaces must preserve `data-api.narrative.*` contract names.

## N-CAP-004 Write Boundary

Narrative-Engine writes only narrative-owned outputs (`turn result`, `spine append`, `audit event`) through caller-provided persistence adapters and must not write non-narrative domains.

## N-CAP-005 Capability Drift Gate

Capability contract additions or removals must be reflected in table source and pass spec consistency verification in the same change.
