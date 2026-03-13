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

## T-FACT-007 Tolerant Projection Diagnostics

Malformed non-critical projection branches may degrade to empty objects or arrays only when strict shadow validation still emits diagnostics. Required story and turn identity fields remain fail-close.
