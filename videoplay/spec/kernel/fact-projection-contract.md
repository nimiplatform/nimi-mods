# Fact Projection Contract

> Owner Domain: `V-FACT-*`

## V-FACT-001 Fact Layer Ownership

Realm owns base facts, Narrative owns narrative facts, VideoPlay owns presentation output.

## V-FACT-002 Write Boundary

VideoPlay must not write narrative spine.

## V-FACT-003 Required Projection

VideoPlay input projection must include required anchor fields and `sourceEventIds`.

## V-FACT-004 Traceability Rule

Episode, clip, beat, and shot units must all carry traceable source event IDs.

## V-FACT-005 Cross-Renderer Consistency

TextPlay and VideoPlay may diverge in style but cannot diverge in canonical facts.

## V-FACT-006 Story Package Supplementary Context

Story package assembly may include world/context/memory supplementary fields, but beat/shot grounding must remain a strict subset of canonical `sourceEventIds` from narrative projection.
