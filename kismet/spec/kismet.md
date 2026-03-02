# Kismet Domain Spec

> Status: Draft
> Date: 2026-03-02
> Scope: Kismet business increments only.

## 0. Normative Imports

- Capability boundary: `kernel/capability-contract.md` (`KIS-CAP-*`)
- Dual-entry generation pipeline: `kernel/pipeline-contract.md` (`KIS-PIPE-*`)
- Error semantics: `kernel/error-model.md` (`KIS-ERR-*`)
- Acceptance gates: `kernel/acceptance-contract.md` (`KIS-ACC-*`)

## 1. Domain Invariants

- `KIS-DOM-001`: Kismet provides BaZi analysis workbench inside desktop mod runtime.
- `KIS-DOM-002`: Prompt-Import and Runtime-AI must produce one unified `KismetResult` schema.
- `KIS-DOM-003`: Runtime-AI calls must use `@nimiplatform/sdk/mod/ai` surfaces.
- `KIS-DOM-004`: Route unavailable must expose visible fallback to Prompt-Import.
- `KIS-DOM-005`: Export is explicit user action only (JSON/PDF/HTML).

## 2. Domain Increments

- `KIS-DOM-010`: Parser supports markdown code-block JSON extraction before schema validation.
- `KIS-DOM-011`: K-line chart requires 1..100 age points and monotonic age index.
- `KIS-DOM-012`: Sensitive input/results stay local by default; no implicit upload.
- `KIS-DOM-013`: User-facing strings require zh/en i18n coverage.

## 3. No Over-Design Guard

- `KIS-DOM-020`: No direct vendor `/chat/completions` URL contract is introduced.
- `KIS-DOM-021`: No cloud sync/telemetry auto-upload contract is introduced.
- `KIS-DOM-022`: No compatibility shim for legacy standalone web shell is introduced.
