# Capability Contract

> Owner Domain: `N-CAP-*`

## N-CAP-001 Manifest Identity Is Fixed

`modId`, `entry`, and module identity fields are fixed by `tables/capabilities.yaml` and must match runtime registration.

## N-CAP-002 Minimal Permission Policy

Narrative-Engine uses explicit, minimum capability keys only. Wildcards and undeclared capability grants are forbidden.

## N-CAP-003 Read Boundary

Narrative-Engine reads world and agent context only through declared `data.query.*` capabilities and route options through runtime route query. Narrative-owned read surfaces must use explicit `data.register.*` + `data.query.*` capability pairs under `data-api.narrative.*`.

## N-CAP-004 Write Boundary

Narrative-Engine writes only narrative-owned outputs (`turn result`, `spine append`, `audit event`) via declared narrative capability pairs and must not write non-narrative domains.

## N-CAP-005 Capability Drift Gate

Capability additions or removals must be reflected in table source and pass spec consistency verification in the same change.
