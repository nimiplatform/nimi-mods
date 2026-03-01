# TextPlay Domain Spec

> Status: Draft
> Date: 2026-03-01
> Scope: Text renderer increments only.

## 0. Normative Imports

- Fact projection: `kernel/fact-projection-contract.md` (`T-FACT-*`)
- Render pipeline: `kernel/pipeline-contract.md` (`T-PIPE-*`)
- Run orchestration and recovery: `kernel/run-orchestration-contract.md` (`T-RUN-*`)
- Visibility and POV: `kernel/visibility-pov-contract.md` (`T-VIS-*`)
- Presence state machine: `kernel/presence-contract.md` (`T-PRES-*`)
- Error semantics: `kernel/error-model.md` (`T-ERR-*`)
- Acceptance gates: `kernel/acceptance-contract.md` (`T-ACC-*`)

## 1. Domain Invariants

- `TXT-001`: TextPlay is a renderer. It cannot create or rewrite narrative facts.
- `TXT-002`: TextPlay consumes only narrative projection inputs.
- `TXT-003`: Visibility and POV constraints are both mandatory.
- `TXT-004`: Persistence failure is non-blocking for returned render output.
- `TXT-005`: Presence transitions must emit auditable report events.
- `TXT-006`: Run recovery must preserve idempotent side effects and terminal-state monotonicity.

## 2. Domain Increments

- `TXT-010`: Input normalization runs before any visibility filter.
- `TXT-011`: Prompt building operates only on filtered event set.
- `TXT-012`: Route-unavailable is fail-close and returns blocking reason code.
- `TXT-013`: Render output must always include `text` and `meta`.
- `TXT-014`: Initiative events reset idle/away timers in presence state machine.
- `TXT-015`: Resume with checkpoint hash mismatch is fail-close.

## 3. No Over-Design Guard

- `TXT-020`: No renderer-side world fact persistence contract is introduced.
- `TXT-021`: No model vendor-specific binding is introduced in domain doc.
- `TXT-022`: No fallback compatibility path is introduced.
