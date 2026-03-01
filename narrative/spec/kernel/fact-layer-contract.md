# Fact Layer Contract

> Owner Domain: `N-FACT-*`

## N-FACT-001 Base Facts

Realm world+agent is the only base fact source.

## N-FACT-002 Narrative Facts

Narrative outputs canonical `CoreOutput` and owns narrative fact compilation.

## N-FACT-003 Renderer Boundary

Renderer layers (`textplay`, `videoplay`) can consume narrative facts but must not write narrative spine.

## N-FACT-004 CoreOutput Whitelist

`CoreOutput` top-level whitelist is fixed: `spineEvents`, `stateChanges`, `metrics`.

## N-FACT-005 Visibility Enum

Visibility enum is fixed: `public`, `internal`, `sensory`. Invalid values fail-close.

## N-FACT-006 Context Scope Boundary

Narrative context scopes are fixed to `CANON|STORY|SUBJECT|RELATION` and cannot store raw world/agent payload.
