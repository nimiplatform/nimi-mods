# World-Studio Spec AGENTS

> Conventions for AI agents working under `nimi-mods/runtime/world-studio/spec/`.

## Authoritative Structure

- `kernel/*.md`: World-Studio cross-domain contracts (`WS-*`).
- `kernel/tables/*.yaml`: authoritative fact sources.
- `kernel/generated/*.md`: generated views from YAML.
- `world-studio.md`: domain-only increments.

## Editing Rules

- Do not manually edit `kernel/generated/*.md`.
- Edit `kernel/tables/*.yaml` first, then align kernel/domain docs in the same change.
- Keep no-legacy mode and no compatibility shim.

## Mandatory Verification

1. `pnpm -C nimi-mods run generate:spec:world-studio-kernel-docs`
2. `pnpm -C nimi-mods run check:spec:world-studio-kernel-docs-drift`
3. `pnpm -C nimi-mods run check:spec:world-studio-kernel-consistency`
