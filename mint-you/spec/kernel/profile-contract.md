# Profile Contract

> Owner Domain: `MY-PROF-*`

## MY-PROF-001 Trait Resolution From Scores

`dnaPrimary` is resolved to the `DnaPrimaryType` enum value with the highest aggregated score. Ties are broken by scenario presentation order (earlier scenario wins).

## MY-PROF-002 Secondary Trait Selection

`dnaSecondary` selects the top 2-3 `DnaSecondaryTrait` values by score, excluding traits that conflict with the resolved `dnaPrimary`. Maximum 3 secondary traits.

## MY-PROF-003 DNA Schema Conformance

The synthesized DNA object must conform to the nimi-realm `AgentDna` 5-dimensional schema. Missing required fields cause synthesis failure.

## MY-PROF-004 LLM Synthesis Scope

LLM synthesis generates natural-language summary fields and Identity Card fields from structured trait scores. It must not override user-provided basic info (name, gender, age).

## MY-PROF-005 Persona Card Derivation

The persona card is derived from the synthesized DNA. It must display: display name, primary archetype, secondary traits, relationship mode, communication style, and a sample greeting. All displayed fields must trace back to DNA fields.

## MY-PROF-006 User Override Propagation

When a user modifies a trait in the preview phase, only dependent LLM-generated fields are re-synthesized. User-provided basic info and unaffected dimensions remain unchanged.
