# Test-AI Domain Spec

> Status: Draft
> Date: 2026-03-07
> Scope: Diagnostic mod for all 8 AI capabilities.

## 0. Normative Imports

- Capability boundary: `kernel/capability-contract.md` (`TAI-CAP-*`)
- Diagnostics pipelines: `kernel/pipeline-contract.md` (`TAI-PIPE-*`)
- Error semantics: `kernel/error-model.md` (`TAI-ERR-*`)
- Acceptance gates: `kernel/acceptance-contract.md` (`TAI-ACC-*`)

## 1. Domain Invariants

- `TAI-DOM-001`: Mod scope is diagnostics only for all 8 AI capabilities.
- `TAI-DOM-002`: Capability set must remain explicit and complete.
- `TAI-DOM-003`: Route options are read-only query inputs.
- `TAI-DOM-004`: Failures must expose actionable reasonCode and stage.
- `TAI-DOM-005`: voice.clone and voice.design show not-available state until SDK surface is implemented.

## 2. No Over-Design Guard

- `TAI-DOM-010`: No business persistence model is introduced.
- `TAI-DOM-011`: No provider-private endpoint contract is introduced.
- `TAI-DOM-012`: No capability expansion beyond the 8 AI diagnostics capabilities.
