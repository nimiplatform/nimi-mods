# Local-Chat Kernel Contracts

> Status: Normative
> Date: 2026-03-02

## Rule ID Format

- Format: `LC-<DOMAIN>-NNN`
- Domain enum: `CAP`, `PIPE`, `ERR`, `ACC`

## Ownership

- `capability-contract.md` -> `LC-CAP-*`
- `pipeline-contract.md` -> `LC-PIPE-*`
- `error-model.md` -> `LC-ERR-*`
- `acceptance-contract.md` -> `LC-ACC-*`

## Fact Sources

- `capabilities.yaml`
- `pipeline-states.yaml`
- `reason-codes.yaml`
- `acceptance-cases.yaml`
