# Profile Contract

> Owner Domain: `KIS-PRO-*`

## KIS-PRO-001 Canonical Profile Authority

Canonical profile facts are authoritative in `tables/canonical-profile-fields.yaml`.
Year/month/day/hour pillars, day master, five-element ratio, favorable elements, unfavorable elements, and big-luck metadata MUST be derived deterministically.

## KIS-PRO-002 No LLM Fact Derivation

LLM outputs MUST NOT redefine pillars, day master, five-element ratio, favorable elements, or unfavorable elements.

## KIS-PRO-003 Location Context Separation

Birth city environment is a separate location context.
It MUST NOT mutate canonical natal facts.

## KIS-PRO-004 Natal Narrative Output

Natal narrative generation may explain deterministic facts and emit `keyNodes`, but it MUST conform to the natal JSON schema and cannot emit city coordinates or raw birth input fields.
