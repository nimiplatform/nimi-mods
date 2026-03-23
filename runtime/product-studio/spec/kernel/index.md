# Product Studio Kernel Contracts

> Status: Normative
> Date: 2026-03-22

## Rule ID Format

- Format: `PS-<DOMAIN>-NNN`
- Domain enum: `DOM`, `PIPE`, `CAP`, `ERR`, `ACC`

## Ownership

- `domain-contract.md` -> `PS-DOM-*`
- `pipeline-contract.md` -> `PS-PIPE-*`
- `capability-contract.md` -> `PS-CAP-*`
- `error-model.md` -> `PS-ERR-*`
- `acceptance-contract.md` -> `PS-ACC-*`

## Fact Sources

- `entities.yaml`
- `pipeline-states.yaml`
- `capabilities.yaml`
- `generation-modes.yaml`
- `batch-states.yaml`
- `reason-codes.yaml`
- `acceptance-cases.yaml`

Generated docs in `generated/` are derived artifacts and must not be edited manually.
