# VideoPlay Kernel Contracts

> Status: Normative
> Date: 2026-03-01

## 1. Goals

Kernel is the only home for VideoPlay cross-domain rules.
Domain docs must reference kernel rule IDs and must not duplicate kernel prose.

## 2. Rule ID Format

- Format: `V-<DOMAIN>-NNN`
- Domain enum: `CAP`, `FACT`, `PIPE`, `SEG`, `EDIT`, `ROUTE`, `QC`, `OPS`, `LINEAGE`, `PROMPT`, `CHAR`, `SCENE`, `CAND`, `AUDIO`, `ERR`, `ACC`

## 3. Ownership

- `capability-contract.md` -> `V-CAP-*`
- `fact-projection-contract.md` -> `V-FACT-*`
- `pipeline-contract.md` -> `V-PIPE-*`
- `segmentation-contract.md` -> `V-SEG-*`
- `edit-compose-contract.md` -> `V-EDIT-*`
- `routing-contract.md` -> `V-ROUTE-*`
- `quality-gate-contract.md` -> `V-QC-*`
- `creator-workflow-contract.md` -> `V-OPS-*`
- `version-lineage-contract.md` -> `V-LINEAGE-*`
- `prompt-governance-contract.md` -> `V-PROMPT-*`
- `character-casting-contract.md` -> `V-CHAR-*`
- `scene-planning-contract.md` -> `V-SCENE-*`
- `candidate-selection-contract.md` -> `V-CAND-*`
- `audio-design-contract.md` -> `V-AUDIO-*`
- `error-model.md` -> `V-ERR-*`
- `acceptance-contract.md` -> `V-ACC-*`

## 4. Fact Sources

- `capabilities.yaml`
- `fact-traceability.yaml`
- `pipeline-states.yaml`
- `segmentation-policy.yaml`
- `edit-compose-policy.yaml`
- `routing-stages.yaml`
- `quality-gates.yaml`
- `creator-operations.yaml`
- `rebuild-impact-matrix.yaml`
- `continuity-constraints.yaml`
- `version-lineage-policy.yaml`
- `forbidden-patterns.yaml`
- `prompt-canary-cases.yaml`
- `reason-codes.yaml`
- `acceptance-cases.yaml`

Generated docs in `generated/` are derived artifacts and must not be edited manually.
