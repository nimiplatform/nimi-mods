# VideoPlay Spec AGENTS

> Conventions for AI agents working under `nimi-mods/videoplay/spec/`.

## Authoritative Structure

- `kernel/*.md`: VideoPlay cross-domain contracts (`V-*`).
- `kernel/tables/*.yaml`: authoritative fact sources.
- `kernel/generated/*.md`: generated views from YAML.
- `videoplay.md`: domain-only increments.

## Editing Rules

- Do not manually edit `kernel/generated/*.md`.
- Edit table facts first, then align kernel/domain docs in the same change.
- Keep no-legacy mode and no compatibility shim.

## Mandatory Verification

1. `pnpm -C nimi-mods run generate:spec:videoplay-kernel-docs`
2. `pnpm -C nimi-mods run check:spec:videoplay-kernel-docs-drift`
3. `pnpm -C nimi-mods run check:spec:videoplay-kernel-consistency`
