# Re-Life Domain Spec

> Status: Draft
> Date: 2026-03-02
> Scope: Re-Life business increments only.

## 0. Normative Imports

- Capability boundary: `kernel/capability-contract.md` (`RL-CAP-*`)
- Simulation pipeline: `kernel/pipeline-contract.md` (`RL-PIPE-*`)
- Error semantics: `kernel/error-model.md` (`RL-ERR-*`)
- Acceptance gates: `kernel/acceptance-contract.md` (`RL-ACC-*`)

## 1. Domain Invariants

- `RL-DOM-001`: Re-Life is decision retrospect and parallel timeline simulation workspace.
- `RL-DOM-002`: Structured simulation is mandatory before screenplay rendering.
- `RL-DOM-003`: Canonical AI chain is `FactGraph -> DecisionTree -> Screenplay`.
- `RL-DOM-004`: Information sealing is default; omniscient mode requires explicit opt-in.
- `RL-DOM-005`: Sharing requires anonymization pipeline and user confirmation.

## 2. Domain Increments

- `RL-DOM-010`: Scenario and decision artifacts are append-oriented with versioned traces.
- `RL-DOM-011`: Perfect Run output must include disclaimer and uncertainty levels.
- `RL-DOM-012`: Share revocation blocks new replays.
- `RL-DOM-013`: MBTI is descriptive reference and must not be framed as deterministic advice.

## 3. No Over-Design Guard

- `RL-DOM-020`: No direct third-party API invocation from mod business flow.
- `RL-DOM-021`: No server-side dependency contract is introduced in mod scope.
- `RL-DOM-022`: No skipped anonymization steps in share flow.
