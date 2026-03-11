# Mint-You Kernel Contracts

> Status: Draft
> Date: 2026-03-04

## 1. Goals

Kernel is the only authoritative layer for Mint-You cross-domain contracts.
Domain docs reference kernel rule IDs and cannot duplicate kernel prose.

## 2. Rule ID Format

- Format: `MY-<DOMAIN>-NNN`
- Domain enum: `CAP`, `INT`, `PROF`, `PIPE`, `PHOTO`, `ERR`, `ACC`

## 3. Ownership

- `capability-contract.md` -> `MY-CAP-*`
- `intake-contract.md` -> `MY-INT-*`
- `profile-contract.md` -> `MY-PROF-*`
- `pipeline-contract.md` -> `MY-PIPE-*`
- `photo-contract.md` -> `MY-PHOTO-*`
- `error-model.md` -> `MY-ERR-*`
- `acceptance-contract.md` -> `MY-ACC-*`

## 4. Fact Sources

- `capabilities.yaml`
- `pipeline-states.yaml`
- `scenario-intake.yaml`
- `trait-dimensions.yaml`
- `field-provenance.yaml`
- `reason-codes.yaml`
- `acceptance-cases.yaml`

Generated docs in `generated/` are derived artifacts and must not be edited manually.
