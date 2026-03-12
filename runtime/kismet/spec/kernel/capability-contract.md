# Capability Contract

> Owner Domain: `KIS-CAP-*`

## KIS-CAP-001 Mods-Only Scope

Kismet v2 MUST be fully implementable inside `nimi-mods/runtime/kismet/**` plus `scripts/spec-kernel-config.mjs`.
No SDK, desktop, runtime, or realm changes are permitted in scope.

## KIS-CAP-002 Hook Boundary

Kismet MUST consume AI and route options only through mod hook capabilities and the stable mod SDK surface:
- `@nimiplatform/sdk/mod`
- `@nimiplatform/sdk/mod/shell`
- `@nimiplatform/sdk/mod/lifecycle`

## KIS-CAP-003 Local-Only Matching

Compatibility in this version is local-only.
No public profile publish, cross-device profile sync, or platform-user lookup is allowed.

## KIS-CAP-004 Internal Data Assets

Deterministic city catalogs, pillar derivation data, and local share profiles are internal mod assets.
They do not require new host capabilities.
