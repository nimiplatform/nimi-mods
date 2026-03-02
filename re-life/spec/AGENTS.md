# Re-Life Spec AGENTS

> Conventions for AI agents working under `nimi-mods/re-life/spec/`.

## Authoritative Structure

- `kernel/*.md`: Re-Life cross-domain contracts (`RL-*`).
- `kernel/tables/*.yaml`: authoritative fact sources.
- `kernel/generated/*.md`: generated views from YAML.
- `re-life.md`: domain increments only.

## Editing Rules

- Do not manually edit `kernel/generated/*.md`.
- Edit `kernel/tables/*.yaml` first, then align kernel/domain docs in the same change.
- Keep no-legacy mode and no compatibility shim.

## Mandatory Verification

1. `pnpm -C nimi-mods run generate:spec:re-life-kernel-docs`
2. `pnpm -C nimi-mods run check:spec:re-life-kernel-docs-drift`
3. `pnpm -C nimi-mods run check:spec:re-life-kernel-consistency`
