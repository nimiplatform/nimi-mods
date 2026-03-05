# Test-Chat-TTS Domain Spec

> Status: Draft
> Date: 2026-03-02
> Scope: Minimal diagnostics mod for chat + image + TTS pipelines.

## 0. Normative Imports

- Capability boundary: `kernel/capability-contract.md` (`TCT-CAP-*`)
- Minimal diagnostics pipeline: `kernel/pipeline-contract.md` (`TCT-PIPE-*`)
- Error semantics: `kernel/error-model.md` (`TCT-ERR-*`)
- Acceptance gates: `kernel/acceptance-contract.md` (`TCT-ACC-*`)

## 1. Domain Invariants

- `TCT-DOM-001`: Mod scope is diagnostics only for chat, image, and TTS.
- `TCT-DOM-002`: Capability set must remain minimal and explicit.
- `TCT-DOM-003`: Route options are read-only query inputs.
- `TCT-DOM-004`: Failures must expose actionable reasonCode and stage.

## 2. No Over-Design Guard

- `TCT-DOM-010`: No business persistence model is introduced.
- `TCT-DOM-011`: No provider-private endpoint contract is introduced.
- `TCT-DOM-012`: No unrelated capability expansion beyond diagnostics scope.
