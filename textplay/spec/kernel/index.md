# TextPlay Kernel Contracts

> Status: Normative
> Date: 2026-03-01

## 1. Goals

Kernel is the only authoritative layer for TextPlay cross-domain contracts.
Domain docs reference kernel rule IDs and cannot duplicate kernel prose.

## 2. Rule ID Format

- Format: `T-<DOMAIN>-NNN`
- Domain enum: `FACT`, `PIPE`, `VIS`, `PRES`, `ERR`, `ACC`

## 3. Ownership

- `fact-projection-contract.md` -> `T-FACT-*`
- `pipeline-contract.md` -> `T-PIPE-*`
- `visibility-pov-contract.md` -> `T-VIS-*`
- `presence-contract.md` -> `T-PRES-*`
- `error-model.md` -> `T-ERR-*`
- `acceptance-contract.md` -> `T-ACC-*`

## 4. Fact Sources

- `projection-mapping.yaml`
- `pipeline-states.yaml`
- `visibility-policies.yaml`
- `presence-transitions.yaml`
- `reason-codes.yaml`
- `acceptance-cases.yaml`

Generated docs in `generated/` are derived artifacts and must not be edited manually.
