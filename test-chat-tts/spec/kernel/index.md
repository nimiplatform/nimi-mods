# Test-Chat-TTS Kernel Contracts

> Status: Normative
> Date: 2026-03-02

## Rule ID Format

- Format: `TCT-<DOMAIN>-NNN`
- Domain enum: `CAP`, `PIPE`, `ERR`, `ACC`

## Ownership

- `capability-contract.md` -> `TCT-CAP-*`
- `pipeline-contract.md` -> `TCT-PIPE-*`
- `error-model.md` -> `TCT-ERR-*`
- `acceptance-contract.md` -> `TCT-ACC-*`

## Fact Sources

- `capabilities.yaml`
- `pipeline-states.yaml`
- `reason-codes.yaml`
- `acceptance-cases.yaml`
