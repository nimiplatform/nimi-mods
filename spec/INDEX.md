# Nimi Mods Spec Index

> Status: Draft
> Date: 2026-03-02

## Structure

- Cross-mod contracts: `spec/mod/**`
- Per-mod specs:
  - `kismet/spec/**`
  - `local-chat/spec/**`
  - `re-life/spec/**`
  - `mint-you/spec/**`
  - `test-ai/spec/**`
  - `narrative-engine/spec/**`
  - `textplay/spec/**`
  - `videoplay/spec/**`
  - `world-studio/spec/**`

## Global Rules

1. Kernel tables are authoritative fact sources.
2. Domain docs only define domain increments and rule references.
3. Generated docs are derived artifacts and must not be edited manually.
4. Shared world-studio -> narrative-engine -> renderer chain contracts are defined once in `spec/mod/**`.

## Task-Oriented Read Path

### Change world-studio -> narrative-engine -> renderer chain contract

1. `spec/mod/worldstudio-narrative-rendering.md`
2. `spec/mod/kernel/chain-run-contract.md`
3. `spec/mod/kernel/chain-guard-contract.md`

### Change a single mod business contract

1. `<mod>/spec/INDEX.md`
2. `<mod>/spec/kernel/*.md`
3. `<mod>/spec/<mod>.md`

## Verification

1. `pnpm -C nimi-mods run generate:spec`
2. `pnpm -C nimi-mods run check:spec`
