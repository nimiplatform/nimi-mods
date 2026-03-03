# Mint-You Spec AGENTS

> Conventions for AI agents working under `nimi-mods/mint-you/spec/`.

## Authoritative Structure

- `kernel/*.md`: Mint-You cross-domain contracts (`MY-*`).
- `kernel/tables/*.yaml`: authoritative fact sources.
- `kernel/generated/*.md`: generated views from YAML.
- `mint-you.md`: domain increments only.

## Editing Rules

- Do not manually edit `kernel/generated/*.md`.
- Update `kernel/tables/*.yaml` first, then align kernel/domain docs in the same change.
- Keep no-legacy mode and no compatibility shim.

## Mandatory Verification

1. `pnpm -C nimi-mods run generate:spec:mint-you-kernel-docs`
2. `pnpm -C nimi-mods run check:spec:mint-you-kernel-docs-drift`
3. `pnpm -C nimi-mods run check:spec:mint-you-kernel-consistency`
4. `pnpm -C nimi-mods run check`
