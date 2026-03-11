# Capability Contract

> Owner Domain: `MY-CAP-*`

## MY-CAP-001 Manifest Identity Is Fixed

`modId`, `entry`, and UI registration identity are fixed by `tables/capabilities.yaml` and must match runtime registration.

## MY-CAP-002 Minimal Permission Policy

Mint-You must declare explicit minimum capability keys only. Wildcards and undeclared grants are forbidden.
Session scoping uses `data-api.world.access.me`; world mounting target resolution uses `data-api.world.oasis.get`.

## MY-CAP-003 LLM Boundary

Mint-You uses `runtime.ai.text.generate` for structured DNA synthesis and Identity Card generation (JSON object parsing happens in-mod). No streaming is required.
Mint-You uses `runtime.route.list.options` to expose route source / connector / model controls for synthesis routing.

## MY-CAP-004 Agent Creation Boundary

Mint-You creates agents through `data-api.creator.agents.create`. The mod must supply a complete `CreateAgentDto` payload including pre-built `dna` object. Agent `ownershipType` is `MASTER_OWNED`. Agent `wakeStrategy` is `PASSIVE`.
Mint-You resolves the target world via `data-api.world.oasis.get`; agent `worldId` is always bound to OASIS.

## MY-CAP-005 Photo Access Control Boundary

Mint-You manages photo visibility through a mod-level authorization layer on top of the existing `referenceImageUrl` field. The mod requires `runtime.profile.read.agent` to intercept agent profile reads and filter `referenceImageUrl` based on mutual authorization state.

The hook dispatch point lives in the desktop/runtime agent profile read path. The hook output is limited to `referenceImageUrl` redaction; it does not allow arbitrary profile mutation.

## MY-CAP-006 Capability Drift Gate

Capability changes must update table source and pass kernel consistency checks in the same change.

## MY-CAP-007 Route Override Must Fail Closed

Mint-You route overrides are bounded by the current `runtime.route.list.options` snapshot.
If a selected source / connector / model disappears, or the user enters a model not advertised by the snapshot, the mod must clamp back to an advertised binding or clear the override and use the runtime default.

Mint-You must not issue AI interview or DNA synthesis calls with stale or unknown route override values.
