# Capability Contract

> Owner Domain: `MY-CAP-*`

## MY-CAP-001 Manifest Identity Is Fixed

`modId`, `entry`, and UI registration identity are fixed by `tables/capabilities.yaml` and must match runtime registration.

## MY-CAP-002 Minimal Permission Policy

Mint-You must declare explicit minimum capability keys only. Wildcards and undeclared grants are forbidden.
Session scoping uses `data-api.world.access.me`; world mounting target resolution uses `data-api.world.oasis.get`.

## MY-CAP-003 LLM Boundary

Mint-You uses `llm.text.generate` for structured DNA synthesis and Identity Card generation (JSON object parsing happens in-mod). No streaming is required.
Mint-You may query `data-api.runtime.route.options` to expose route source / connector / model controls for synthesis routing.

## MY-CAP-004 Agent Creation Boundary

Mint-You creates agents through `data-api.creator.agents.create`. The mod must supply a complete `CreateAgentDto` payload including pre-built `dna` object. Agent `ownershipType` is `WORLD_OWNED`. Agent `wakeStrategy` is `PASSIVE`.
Mint-You resolves the target world via `data-api.world.oasis.get`; agent `worldId` is always bound to OASIS.

## MY-CAP-005 Photo Access Control Boundary

Mint-You manages photo visibility through a mod-level authorization layer on top of the existing `referenceImageUrl` field. The mod requires `hook.agent-profile.read` to intercept agent profile reads and filter `referenceImageUrl` based on mutual authorization state.

**Platform dependency:** `hook.agent-profile.read` requires a hook dispatch point in the desktop/runtime agent profile read path. This dispatch point does not exist yet — the desktop app currently reads agent profiles via direct `realm.raw.request(...)` calls. The photo authorization state machine (request/accept/decline/revoke) and all UI flows are implementable immediately. The read-time filtering enforcement is blocked until the platform exposes the hook. See `MY-PHOTO-002` for graceful degradation strategy.

## MY-CAP-006 Capability Drift Gate

Capability changes must update table source and pass kernel consistency checks in the same change.
