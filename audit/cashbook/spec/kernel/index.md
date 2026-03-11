# Cashbook Kernel Contracts

> Status: Normative
> Date: 2026-03-04

## Rule ID Format

- Format: `CSB-<DOMAIN>-NNN`
- Domain enum: `CAP`, `PIPE`, `ENR`, `ERR`, `ACC`

## Ownership

- `capability-contract.md` -> `CSB-CAP-*`
- `pipeline-contract.md` -> `CSB-PIPE-*`
- `enrichment-contract.md` -> `CSB-ENR-*`
- `error-model.md` -> `CSB-ERR-*`
- `acceptance-contract.md` -> `CSB-ACC-*`

## Fact Sources

- `capabilities.yaml`
- `pipeline-states.yaml`
- `enrichment-dimensions.yaml`
- `reason-codes.yaml`
- `acceptance-cases.yaml`
