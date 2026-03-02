# Narrative-Engine Spec AGENTS

> Conventions for AI agents working under `nimi-mods/narrative-engine/spec/`.

## Authoritative Structure

- `kernel/*.md`: Narrative-Engine cross-domain rule contracts (`N-*`).
- `kernel/tables/*.yaml`: authoritative fact sources.
- `kernel/generated/*.md`: generated views from YAML tables.
- `narrative-engine.md`: domain-only increments with kernel rule references.

## Editing Rules

- Do not manually edit `kernel/generated/*.md`.
- Change facts in `kernel/tables/*.yaml` first, then align kernel/domain docs in the same change.
- Keep no-legacy mode. Do not keep dual contracts.

## Mandatory Verification

1. `pnpm -C nimi-mods run generate:spec:narrative-engine-kernel-docs`
2. `pnpm -C nimi-mods run check:spec:narrative-engine-kernel-docs-drift`
3. `pnpm -C nimi-mods run check:spec:narrative-engine-kernel-consistency`
