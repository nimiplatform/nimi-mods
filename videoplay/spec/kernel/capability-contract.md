# Capability Contract

> Owner Domain: `V-CAP-*`

## V-CAP-001 Manifest Identity Is Fixed

`modId`, `entry`, and UI registration identity are fixed by `tables/capabilities.yaml` and must match runtime registration.

## V-CAP-002 Minimal Permission Policy

VideoPlay uses explicit minimum capability grants only. Wildcard capability grants are forbidden.

## V-CAP-003 Route and Vendor Boundary

VideoPlay must consume model routes from runtime route options and must not directly access vendor APIs.

## V-CAP-004 Fact Read/Write Boundary

VideoPlay reads narrative projection through shared Narrative-Engine module API and writes videoplay-owned production assets only through declared `data.register.*` + `data.query.*` pairs under `data-api.videoplay.*`.

## V-CAP-005 Capability Drift Gate

Any capability change must update table source and pass kernel consistency checks in the same change.

## V-CAP-006 Story Package Read Scope

VideoPlay may read `world.events/scenes/narrative-contexts/lorebooks` and `core.agent.memory.recall` for `VideoStoryPackage` assembly, but these reads cannot extend write scope or narrative fact write permissions.

## V-CAP-007 Speech Capability Boundary

Voice generation must use runtime-managed speech capability (`llm.speech.synthesize`) and route resolution (`local-runtime -> token-api`) only.
