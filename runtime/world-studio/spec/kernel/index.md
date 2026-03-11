# World-Studio Kernel Contracts

> Status: Normative
> Date: 2026-03-02

## 1. Goals

Kernel is the only home for World-Studio cross-domain rules.
Domain docs must reference kernel rule IDs and must not duplicate kernel prose.

## 2. Rule ID Format

- Format: `WS-<DOMAIN>-NNN`
- Domain enum: `CAP`, `TASK`, `PIPE`, `ROUTE`, `QG`, `CONFLICT`, `ERR`, `ACC`

## 3. Ownership

- `capability-contract.md` -> `WS-CAP-*`
- `task-lifecycle-contract.md` -> `WS-TASK-*`
- `pipeline-contract.md` -> `WS-PIPE-*`
- `route-readiness-contract.md` -> `WS-ROUTE-*`
- `quality-gate-contract.md` -> `WS-QG-*`
- `conflict-recovery-contract.md` -> `WS-CONFLICT-*`
- `error-model.md` -> `WS-ERR-*`
- `acceptance-contract.md` -> `WS-ACC-*`

## 4. Fact Sources

- `capabilities.yaml`
- `task-states.yaml`
- `pipeline-states.yaml`
- `route-readiness-codes.yaml`
- `quality-gate-policies.yaml`
- `conflict-recovery-policy.yaml`
- `reason-codes.yaml`
- `acceptance-cases.yaml`

Generated docs in `generated/` are derived artifacts and must not be edited manually.
