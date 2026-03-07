# Kismet Kernel Contracts

> Status: Draft
> Date: 2026-03-06

## 1. Goals

Kernel is the only authoritative layer for Kismet cross-domain contracts.
Kismet v2 is a mods-only deterministic birth-intake system with LLM explanation layers for natal analysis, daily fortune, and local-only compatibility.

## 2. Rule ID Format

- Format: `KIS-<DOMAIN>-NNN`
- Domain enum: `CAP`, `IN`, `PRO`, `CITY`, `DAY`, `COMP`, `PRI`, `PIPE`, `ERR`, `ACC`

## 3. Ownership

- `capability-contract.md` -> `KIS-CAP-*`
- `intake-contract.md` -> `KIS-IN-*`
- `profile-contract.md` -> `KIS-PRO-*`
- `city-affinity-contract.md` -> `KIS-CITY-*`
- `daily-fortune-contract.md` -> `KIS-DAY-*`
- `compatibility-contract.md` -> `KIS-COMP-*`
- `privacy-contract.md` -> `KIS-PRI-*`
- `pipeline-contract.md` -> `KIS-PIPE-*`
- `error-model.md` -> `KIS-ERR-*`
- `acceptance-contract.md` -> `KIS-ACC-*`

## 4. Fact Sources

- `capabilities.yaml`
- `input-fields.yaml`
- `canonical-profile-fields.yaml`
- `city-affinity-model.yaml`
- `privacy-consent-policies.yaml`
- `pipeline-states.yaml`
- `reason-codes.yaml`
- `acceptance-cases.yaml`

Generated docs in `generated/` are derived artifacts and must not be edited manually.
