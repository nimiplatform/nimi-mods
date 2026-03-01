# Narrative Kernel Contracts

> Status: Normative
> Date: 2026-03-01

## 1. Goals

Kernel is the only home for Narrative cross-domain rules.
Domain docs must reference kernel rule IDs and must not duplicate kernel prose.

## 2. Rule ID Format

- Format: `N-<DOMAIN>-NNN`
- Domain enum: `FACT`, `PIPE`, `CTX`, `GUARD`, `INIT`, `ERR`, `ACC`
- Example: `N-PIPE-001`

## 3. Ownership

- `fact-layer-contract.md` -> `N-FACT-*`
- `pipeline-contract.md` -> `N-PIPE-*`
- `context-assembly-contract.md` -> `N-CTX-*`
- `guard-contract.md` -> `N-GUARD-*`
- `initiative-contract.md` -> `N-INIT-*`
- `error-model.md` -> `N-ERR-*`
- `acceptance-contract.md` -> `N-ACC-*`

## 4. Fact Sources

Authoritative tables live in `tables/` and must be the first edit point:

- `fact-layers.yaml`
- `pipeline-states.yaml`
- `context-snapshot-fields.yaml`
- `guard-policies.yaml`
- `initiative-policies.yaml`
- `reason-codes.yaml`
- `acceptance-cases.yaml`

Generated views in `generated/` are derived artifacts and are never edited manually.
