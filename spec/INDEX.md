# Nimi Mods Spec Index

> Status: Draft
> Date: 2026-03-02

This spec root is the mods workspace authority surface.

It is physically nested under `nimi/`, but it remains logically independent
from `nimi/.nimi/spec/**`.

Cross-repo read path:

- public upper-layer topology entrypoint lives in `nimi/.nimi/spec/**`
- private realm / backend authority lives in `nimi-realm/.nimi/spec/**`
- mods-local shared chain and per-mod business authority live here in
  `nimi-mods/spec/**`

Nesting under `nimi/` does not transfer mod semantic ownership back to the
public platform spec root.

## Structure

- Cross-mod contracts: `spec/mod/**`
- Per-mod specs:
  - `runtime/kismet/spec/**`
  - `runtime/scene-atlas/spec/**`
  - `audit/re-life/spec/**`
  - `runtime/mint-you/spec/**`
  - `runtime/test-ai/spec/**`
  - `modules/narrative-engine/spec/**`
  - `runtime/textplay/spec/**`
  - `runtime/videoplay/spec/**`
  - `runtime/world-studio/spec/**`

## Global Rules

1. Kernel tables are authoritative fact sources.
2. Domain docs only define domain increments and rule references.
3. Generated docs are derived artifacts and must not be edited manually.
4. Shared world-studio -> narrative-engine -> renderer chain contracts are defined once in `spec/mod/**`.
5. Workspace layout and package bucket rules are defined once in `spec/mod/kernel/workspace-structure-contract.md`.
6. `world-studio` remains an active mods-local authority surface during the
   current Forge migration line; Forge-native replacement direction does not
   erase this spec root until replacement is fully landed elsewhere.

## Task-Oriented Read Path

### Change world-studio -> narrative-engine -> renderer chain contract

1. `spec/mod/worldstudio-narrative-rendering.md`
2. `spec/mod/kernel/chain-run-contract.md`
3. `spec/mod/kernel/chain-guard-contract.md`

### Change a single mod business contract

1. `<bucket>/<mod>/spec/INDEX.md`
2. `<bucket>/<mod>/spec/kernel/*.md`
3. `<bucket>/<mod>/spec/<mod>.md`

## Verification

1. `pnpm -C nimi-mods run generate:spec`
2. `pnpm -C nimi-mods run check:spec`
