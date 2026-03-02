# Acceptance Contract

> Owner Domain: `LC-ACC-*`

## LC-ACC-001 Table-Driven Acceptance

Acceptance matrix is authoritative in `tables/acceptance-cases.yaml`.

## LC-ACC-002 Required Coverage

Minimum acceptance coverage must include:

1. first session auto-create
2. assistant turn audit persistence
3. route override local scope
4. speech failure non-blocking behavior
5. session delete recovery
6. proactive policy guard when user setting disables proactive contact
7. proactive policy allow path when wake strategy and idle window are eligible
