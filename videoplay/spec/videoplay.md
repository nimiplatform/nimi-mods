# VideoPlay Domain Spec

> Status: Draft
> Date: 2026-03-01
> Scope: Episode-scale video renderer increments only.

## 0. Normative Imports

- Fact and traceability boundary: `kernel/fact-projection-contract.md` (`V-FACT-*`)
- Production pipeline: `kernel/pipeline-contract.md` (`V-PIPE-*`)
- Segmentation: `kernel/segmentation-contract.md` (`V-SEG-*`)
- Edit compose and AV constraints: `kernel/edit-compose-contract.md` (`V-EDIT-*`)
- Route selection and fallback audit: `kernel/routing-contract.md` (`V-ROUTE-*`)
- Quality gates: `kernel/quality-gate-contract.md` (`V-QC-*`)
- Error semantics and acceptance: `kernel/error-model.md`, `kernel/acceptance-contract.md` (`V-ERR-*`, `V-ACC-*`)

## 1. Domain Invariants

- `VID-001`: VideoPlay is episode production, not one-shot long video generation.
- `VID-002`: VideoPlay consumes narrative projection and cannot rewrite narrative facts.
- `VID-003`: Every rendered unit must carry `sourceEventIds` for grounding.
- `VID-004`: Route capability is provided by runtime only; mod direct vendor API is forbidden.
- `VID-005`: Quality gate failures fail-close and block release package.

## 2. Domain Increments

- `VID-010`: Segmentation is deterministic under same input and policy.
- `VID-011`: Edit compose forbids timeline overlap and enforces AV drift threshold.
- `VID-012`: Fallback from local-runtime to token-api must be auditable.
- `VID-013`: Same idempotency key replay cannot duplicate side effects.
- `VID-014`: Release package minimum set is mandatory for publish readiness.

## 3. No Over-Design Guard

- `VID-020`: No renderer-owned world fact persistence model is introduced.
- `VID-021`: No vendor-specific model binding is encoded in domain rules.
- `VID-022`: No compatibility fallback path is introduced.
