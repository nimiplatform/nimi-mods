# Profile Contract

> Owner Domain: `MY-PROF-*`

## MY-PROF-001 Trait Resolution From Scores

`dnaPrimary` is resolved to the `DnaPrimaryType` enum value with the highest aggregated score. Ties are broken by scenario presentation order (earlier scenario wins). `relationshipMode` is resolved to the highest-scoring value among `SECURE`, `PASSIONATE`, `INDEPENDENT`. `communication.formality` and `communication.sentiment` are each resolved to the highest-scoring enum value.

## MY-PROF-002 Secondary Trait Selection

`dnaSecondary` selects the top 2-3 `DnaSecondaryTrait` values by score, excluding traits that conflict with the resolved `dnaPrimary`. Maximum 3 secondary traits.

## MY-PROF-003 DNA Schema Conformance

The synthesized DNA object must conform to the nimi-realm `AgentDna` 5-dimensional schema. Every required field must have a value. Missing required fields cause synthesis failure with `MINTYOU_DNA_SYNTHESIS_FAILED`.

## MY-PROF-004 LLM Synthesis Scope

LLM synthesis generates all fields marked `provenance: llm-synthesis` in `tables/field-provenance.yaml`. Input context includes: resolved trait scores, basic info, interest tags, and deterministic extraction results. LLM must not override user-provided basic info (name, gender, age) or deterministic results (dnaPrimary, dnaSecondary, formality, sentiment, relationshipMode).

## MY-PROF-005 Hard-Coded Defaults

Fields marked `provenance: hard-coded` in `tables/field-provenance.yaml` use fixed values appropriate for the social-persona context. These fields satisfy schema requirements but do not influence agent behavior. The authoritative default values are defined in the provenance table.

## MY-PROF-006 Persona Card Derivation

The persona card is derived from the synthesized DNA. It must display: display name, primary archetype, secondary traits, social mode summary, communication style summary, and a sample greeting. All displayed fields must trace back to DNA fields.

## MY-PROF-007 Handle Generation

Agent `handle` is auto-generated: `slug(displayName)` + random 4-character alphanumeric suffix. If the generated handle is unavailable (backend returns `MINTYOU_HANDLE_UNAVAILABLE`), retry with a new random suffix up to 3 times before failing.

## MY-PROF-008 User Override Propagation

When a user modifies a trait in the preview phase, only dependent LLM-generated fields are re-synthesized. User-provided basic info, deterministic extraction results, and hard-coded defaults remain unchanged.
