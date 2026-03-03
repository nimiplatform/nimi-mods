# Fact Projection Contract

> Owner Domain: `T-FACT-*`

## T-FACT-001 Canonical Input

TextPlay input source is narrative `CoreOutput` projection only.

## T-FACT-002 No Direct Prose Bypass

Direct prose generation bypassing narrative projection is forbidden.

## T-FACT-003 Projection Mapping

Projection mapping from narrative to render input is fixed by table contract.

## T-FACT-004 Fact Rewrite Ban

TextPlay cannot create or rewrite narrative facts.

## T-FACT-005 Event Type Passthrough

Spine event `type` field is passed through projection into TextPlay render input. Unknown types degrade gracefully to `scene-beat` rendering.

## T-FACT-006 Tension Metric Passthrough

`CoreOutput.metrics.tension` is passed through to `RenderInput.pacingContext` with band classification (HIGH >= 0.7, MODERATE >= 0.4, LOW < 0.4).
