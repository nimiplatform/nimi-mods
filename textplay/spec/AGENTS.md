# TextPlay Spec AGENTS

> Conventions for AI agents working under `nimi-mods/textplay/spec/`.

## Authoritative Structure

- `kernel/*.md`: TextPlay cross-domain contracts (`T-*`).
- `kernel/tables/*.yaml`: authoritative fact sources.
- `kernel/generated/*.md`: generated views from YAML.
- `textplay.md`: domain increments only.

## Editing Rules

- Do not manually edit `kernel/generated/*.md`.
- Update `kernel/tables/*.yaml` first, then align kernel/domain docs in the same change.
- Keep no-legacy mode and no compatibility shim.

## Mandatory Verification

1. `pnpm -C nimi-mods run generate:spec:textplay-kernel-docs`
2. `pnpm -C nimi-mods run check:spec:textplay-kernel-docs-drift`
3. `pnpm -C nimi-mods run check:spec:textplay-kernel-consistency`
