# Audio Book Kernel Index

> Rule ID format: `VS-<DOMAIN>-NNN`

## Domains

- `VS-CAP-*` -> `capability-contract.md`
- `VS-ENT-*` -> `entity-contract.md`
- `VS-PIPE-*` -> `pipeline-contract.md`
- `VS-SYNTH-*` -> `synthesis-contract.md`
- `VS-ERR-*` -> `error-model.md`
- `VS-ACC-*` -> `acceptance-contract.md`

## Fact Sources

- Authoritative prose rules live in the kernel markdown documents above.
- Structured facts live in `kernel/tables/*.yaml`.
- Generated mirrors in `kernel/generated/*.md` are derived output only.
- Domain documents under `audio-book/spec/*.md` may explain usage, but must not define kernel rules.
