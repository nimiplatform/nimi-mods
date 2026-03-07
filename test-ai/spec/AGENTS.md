# Test-AI Spec AGENTS

> Conventions for AI agents working under `nimi-mods/test-ai/spec/`.

## Authoritative Structure

- `kernel/*.md`: Test-AI cross-domain contracts (`TAI-*`).
- `kernel/tables/*.yaml`: authoritative fact sources.
- `kernel/generated/*.md`: generated views from YAML.
- `test-ai.md`: domain increments only.

## Editing Rules

- Do not manually edit `kernel/generated/*.md`.
- Edit `kernel/tables/*.yaml` first, then align kernel/domain docs in the same change.
- Keep no-legacy mode and no compatibility shim.

## Mandatory Verification

1. `pnpm -C nimi-mods run generate:spec:test-ai-kernel-docs`
2. `pnpm -C nimi-mods run check:spec:test-ai-kernel-docs-drift`
3. `pnpm -C nimi-mods run check:spec:test-ai-kernel-consistency`
