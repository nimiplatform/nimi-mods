# Scene-Atlas Kernel Contracts

> Status: Active
> Date: 2026-03-24

## 1. Goals

Kernel 是 Scene-Atlas 唯一权威层，定义：

- Scene-Atlas material object model
- 导入图片到场景素材的稳定流水线
- mod 能力边界
- readiness / publish handoff 约束
- 错误语义与验收门

## 2. Rule ID Format

- Format: `SA-<DOMAIN>-NNN`
- Domain enum: `DOM`, `CAP`, `PIPE`, `ERR`, `ACC`

## 3. Ownership

- `domain-contract.md` -> `SA-DOM-*`
- `capability-contract.md` -> `SA-CAP-*`
- `pipeline-contract.md` -> `SA-PIPE-*`
- `error-model.md` -> `SA-ERR-*`
- `acceptance-contract.md` -> `SA-ACC-*`

## 4. Fact Sources

- `entities.yaml`
- `capabilities.yaml`
- `pipeline-states.yaml`
- `reason-codes.yaml`
- `acceptance-cases.yaml`

Generated docs in `generated/` are derived artifacts and must not be edited manually.
