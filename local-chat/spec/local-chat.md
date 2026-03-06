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

- `LC-DOM-010`: Session entry uses target-scoped sessions and supports create/switch/delete.
- `LC-DOM-011`: Prompt and route resolution are controller-layer concerns, not view-layer logic.
- `LC-DOM-012`: TTS route source is explicit (`local-runtime|token-api|auto`).
- `LC-DOM-013`: Agent voice style prompt is auto-locked and not user-editable.
- `LC-DOM-014`: `allowProactiveContact` is opt-in and driven by heartbeat scheduling.
- `LC-DOM-015`: Proactive heartbeat policy emits deterministic reason codes for gate/audit outcomes.
- `LC-DOM-016`: Core social/world/memory read dependencies are explicit capability declarations.
- `LC-DOM-017`: `enableVoice=false` is strict-off; Local-Chat MUST NOT synthesize speech, transcribe audio, or query preset voices while disabled.
- `LC-DOM-018`: Voice catalog resolution is binding-and-model scoped; Local-Chat MUST NOT maintain a second provider-level voice truth.
- `LC-DOM-019`: TTS playback accepts either artifact `uri` or bytes-backed audio payload; bytes-only success is not a playback failure.
- `LC-DOM-023`: Mod-facing dependency snapshots consumed by Local-Chat MUST expose runtime canonical capability tokens, not legacy short aliases.

## 3. No Over-Design Guard

- `LC-DOM-020`: No direct provider private audio/text endpoint contract.
- `LC-DOM-021`: No import from `@nimiplatform/sdk/mod/host` in business paths.
- `LC-DOM-022`: No UI-only protocol bypass of registered hook capabilities.
