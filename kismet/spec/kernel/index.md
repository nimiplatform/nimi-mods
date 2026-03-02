# Kismet Kernel Contracts

> Status: Normative
> Date: 2026-03-02

## Rule ID Format

- Format: `KIS-<DOMAIN>-NNN`
- Domain enum: `CAP`, `PIPE`, `ERR`, `ACC`

## Ownership

- `capability-contract.md` -> `KIS-CAP-*`
- `pipeline-contract.md` -> `KIS-PIPE-*`
- `error-model.md` -> `KIS-ERR-*`
- `acceptance-contract.md` -> `KIS-ACC-*`

## Fact Sources

- `capabilities.yaml`
- `pipeline-states.yaml`
- `reason-codes.yaml`
- `acceptance-cases.yaml`
