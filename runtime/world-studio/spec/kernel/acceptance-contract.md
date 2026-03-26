# Acceptance Contract

> Owner Domain: `WS-ACC-*`

## WS-ACC-001 Table-Driven Cases

Acceptance behavior is authoritative in `tables/acceptance-cases.yaml`.

## WS-ACC-002 Minimum Coverage

Coverage includes route gating, retry logical-index safety, start-time projection, event-horizon preservation, synthesize context integrity, publish payload integrity, narrative handoff integrity, conflict recovery, and maintain data-surface alignment (`state / truth / history / bindings`).

## WS-ACC-003 Verification Commands

All checks must pass:

1. kernel docs generation
2. docs drift check
3. consistency check
