# Cashbook Spec AGENTS

> Conventions for AI agents working under `nimi-mods/audit/cashbook/spec/`.

## Authoritative Structure

- `kernel/*.md`: Cashbook cross-domain contracts (`CSB-*`).
- `kernel/tables/*.yaml`: authoritative fact sources.
- `kernel/generated/*.md`: generated views from YAML.
- `cashbook.md`: domain increments only.

## Editing Rules

- Do not manually edit `kernel/generated/*.md`.
- Edit `kernel/tables/*.yaml` first, then align kernel/domain docs in the same change.
- Keep no-legacy mode and no compatibility shim.

## Mandatory Verification

1. `pnpm -C nimi-mods run generate:spec:cashbook-kernel-docs`
2. `pnpm -C nimi-mods run check:spec:cashbook-kernel-docs-drift`
3. `pnpm -C nimi-mods run check:spec:cashbook-kernel-consistency`
