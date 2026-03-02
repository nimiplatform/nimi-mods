# Context Assembly Contract

> Owner Domain: `N-CTX-*`

## N-CTX-001 Assembly Chain

Assembly chain is fixed to:
`fetch-realm-assets -> resolve-scope-coverage -> resolve-scene-and-material -> compose-snapshot`.

## N-CTX-002 Stable Boundary Reads

World+agent reads must go through stable realm boundaries only.

## N-CTX-003 Bounded Injection

Unbounded full-context injection is forbidden.

## N-CTX-004 Required Snapshot Fields

Context snapshot must include all required fields defined in table source.
Missing `CANON` or `STORY` coverage is fail-close. Missing `SUBJECT|RELATION|scene` is degraded warning-only.

## N-CTX-005 Raw Payload Ban

Narrative context must not persist raw world or agent payload.
