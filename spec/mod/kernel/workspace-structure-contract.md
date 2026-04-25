# Mods Workspace Structure Contract

> Status: Normative
> Date: 2026-03-11

## Purpose

Define the only supported `nimi-mods` workspace layout for first-party runtime mods, shared capability modules, and audit-only packages.

## Rules

### MC-WS-001 Top-level package directories are forbidden

`nimi-mods/` root MUST only host infrastructure directories such as `runtime/`, `modules/`, `audit/`, `scripts/`, `shared/`, `spec/`, and `dev/`.

New mod or package directories MUST NOT be added directly under `nimi-mods/`.

### MC-WS-002 Runtime mods live under `runtime/*`

Every runtime-loadable first-party mod MUST live under `nimi-mods/runtime/<mod>/`.

Each runtime mod directory MUST own its runtime manifest, source, tests, and business spec under the same subtree.

### MC-WS-003 Capability modules live under `modules/*`

Every non-runtime capability package shared by runtime mods MUST live under `nimi-mods/modules/<pkg>/`.

Capability modules MAY participate in the workspace and spec verification chain, but MUST NOT ship a runtime mod manifest unless they are intentionally promoted into a runtime mod.

### MC-WS-004 Audit-only packages live under `audit/*`

Packages that are not part of the active runtime workspace contract MUST live under `nimi-mods/audit/<pkg>/`.

`audit/*` entries MUST NOT be included in `pnpm-workspace.yaml`.

### MC-WS-005 Workspace discovery is path-based

Build, verify, spec, and release tooling MUST resolve packages from `nimi-mods`-root-relative paths such as `runtime/kismet` or `modules/narrative-engine`.

Tooling MUST NOT accept or infer flat top-level package names such as `kismet`.

### MC-WS-006 Desktop dev source points at runtime buckets

Desktop local mod development MUST use `nimi-mods/runtime` or a specific `nimi-mods/runtime/<mod>` directory as the source root.

`nimi-mods/` root MUST NOT be treated as the primary runtime mod source directory.
