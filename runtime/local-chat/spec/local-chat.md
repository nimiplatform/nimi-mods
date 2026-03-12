# Local-Chat Domain Spec

> Status: Draft
> Date: 2026-03-02
> Scope: Local-Chat business increments only.

## 0. Normative Imports

- Capability boundary: `kernel/capability-contract.md` (`LC-CAP-*`)
- Turn and speech pipeline: `kernel/pipeline-contract.md` (`LC-PIPE-*`)
- Error semantics: `kernel/error-model.md` (`LC-ERR-*`)
- Acceptance gates: `kernel/acceptance-contract.md` (`LC-ACC-*`)

## 1. Domain Invariants

- `LC-DOM-001`: Local-Chat is desktop local session runtime, not cloud chat runtime.
- `LC-DOM-002`: Session/turn persistence is local-only by default.
- `LC-DOM-003`: Route overrides are mod-scoped and must not mutate global runtime defaults.
- `LC-DOM-004`: Assistant turn must include auditable diagnostics.
- `LC-DOM-005`: Speech failures are non-blocking to text turn commit.

## 2. Domain Increments

- `LC-DOM-010`: Each viewer-target relation owns one recoverable session thread; entry auto-creates or reuses that sole session, and Local-Chat does not expose multi-session create/switch/delete UX.
- `LC-DOM-011`: Prompt and route resolution are controller-layer concerns, not view-layer logic.
- `LC-DOM-012`: TTS route source is explicit (`local|cloud|auto`).
- `LC-DOM-013`: Agent voice style prompt is auto-locked and not user-editable.
- `LC-DOM-014`: `allowProactiveContact` is opt-in and driven by heartbeat scheduling.
- `LC-DOM-015`: Proactive heartbeat policy emits deterministic reason codes for gate/audit outcomes.
- `LC-DOM-016`: Core social/world/memory read dependencies are explicit capability declarations.
- `LC-DOM-017`: Derived voice availability is strict-off only when `voiceAutonomy=off` and `voiceConversationMode=off`; in that state Local-Chat MUST NOT synthesize speech, transcribe audio, or query preset voices.
- `LC-DOM-018`: Voice catalog resolution is binding-and-model scoped; Local-Chat MUST NOT maintain a second provider-level voice truth.
- `LC-DOM-019`: TTS playback accepts either artifact `uri` or bytes-backed audio payload; bytes-only success is not a playback failure.
- `LC-DOM-023`: Mod-facing dependency snapshots consumed by Local-Chat MUST expose runtime canonical capability tokens, not legacy short aliases.
- `LC-DOM-024`: `interactionProfile` is derived locally from `agentProfile.dna + agentMetadata + world/worldview`; Local-Chat MUST NOT require a closed-source realm projection for this layer.
- `LC-DOM-025`: User-facing assistant delivery is `firstBeat`-first: Local-Chat may show a generic pending state only before firstBeat text appears, may use a transient first-beat streaming preview, and must replace that preview in place with the finalized first beat before later beats are scheduled by the delivery director.
- `LC-DOM-026`: `voiceAutonomy` and `mediaAutonomy` are the user-facing trigger policies, both using `off | explicit-only | natural` semantics.
- `LC-DOM-027`: `voiceConversationMode` is a session-scoped on/off overlay for pure voice conversation; when enabled, subsequent non-explicit-media replies stay in voice until disabled.
- `LC-DOM-028`: `enableVoice` is an internal derived gate computed from `voiceAutonomy + voiceConversationMode`; it is not a persisted product setting and does not guarantee that every reply becomes voice.
- `LC-DOM-029`: Visual content style is expressed as `restrained | natural` user language; NSFW allowance derives from route source plus visual style, not from a direct NSFW toggle.
- `LC-DOM-030`: `deliveryStyle` and `relationshipBoundaryPreset` are internal strategy outputs derived from `interactionProfile + interactionSnapshot`; they are not product settings exposed to the user and MUST NOT be persisted as user-facing preferences.
- `LC-DOM-031`: Desktop route shell must remain full-height and self-contained: target space, stage view, chat view, and overlay drawers MUST size against the host content viewport and keep scrolling inside their own panels instead of leaking to the page root.
- `LC-DOM-032`: Settings and profile drawers are independent scroll surfaces; opening a drawer MUST NOT horizontally shift or vertically resize the underlying target, stage, or chat shell.
- `LC-DOM-033`: Target-space landing shell is intentionally minimal: the desktop entry state shows only the bubble field surface, and does not require a top hero, search field, or settings control row.

## 3. No Over-Design Guard

- `LC-DOM-020`: No direct provider private audio/text endpoint contract.
- `LC-DOM-021`: No host wiring import in business paths.
- `LC-DOM-022`: No UI-only protocol bypass of registered hook capabilities.
