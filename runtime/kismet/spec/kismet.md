# Kismet Domain Spec

> Status: Draft
> Date: 2026-03-06
> Scope: Kismet business increments only.

## 0. Normative Imports

- Capability boundary: `kernel/capability-contract.md` (`KIS-CAP-*`)
- Birth intake boundary: `kernel/intake-contract.md` (`KIS-IN-*`)
- Canonical profile boundary: `kernel/profile-contract.md` (`KIS-PRO-*`)
- City affinity boundary: `kernel/city-affinity-contract.md` (`KIS-CITY-*`)
- Daily fortune boundary: `kernel/daily-fortune-contract.md` (`KIS-DAY-*`)
- Compatibility boundary: `kernel/compatibility-contract.md` (`KIS-COMP-*`)
- Privacy boundary: `kernel/privacy-contract.md` (`KIS-PRI-*`)
- Pipeline semantics: `kernel/pipeline-contract.md` (`KIS-PIPE-*`)
- Error semantics: `kernel/error-model.md` (`KIS-ERR-*`)
- Acceptance gates: `kernel/acceptance-contract.md` (`KIS-ACC-*`)

## 1. Domain Invariants

- `KIS-DOM-001`: Kismet v2 is a deterministic birth-intake mod running entirely inside `nimi-mods`.
- `KIS-DOM-002`: Canonical natal facts are deterministic; LLM is explanation-only.
- `KIS-DOM-003`: Birth city participates as location context only and cannot mutate natal core.
- `KIS-DOM-004`: Daily fortune depends on an existing canonical profile.
- `KIS-DOM-005`: Compatibility is local-only in this version and uses derived local share profiles only.
- `KIS-DOM-006`: Prompt-import fallback remains available for natal, daily, and compatibility generation when runtime AI route is unavailable.

## 2. Domain Increments

- `KIS-DOM-010`: User input is simplified to birth date, birth time, birth city, timezone, gender, and local consent flags.
- `KIS-DOM-011`: Natal results include five-element ratio, birth-city explanation, city affinity ranking, and K-line chart rendering.
- `KIS-DOM-012`: Daily fortune produces structured action guidance from deterministic day context.
- `KIS-DOM-013`: Local share profiles persist only derived compatibility fields.
- `KIS-DOM-014`: User-facing strings require zh/en i18n coverage.

## 3. No Over-Design Guard

- `KIS-DOM-020`: No direct SDK/runtime bypass is introduced.
- `KIS-DOM-021`: No platform-side public profile publish path is introduced.
- `KIS-DOM-022`: No new third-party map dependency is introduced.
