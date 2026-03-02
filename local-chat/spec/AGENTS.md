# Local-Chat Spec AGENTS

> Conventions for AI agents working under `nimi-mods/local-chat/spec/`.

## Authoritative Structure

- `kernel/*.md`: Local-Chat cross-domain contracts (`LC-*`).
- `kernel/tables/*.yaml`: authoritative fact sources.
- `kernel/generated/*.md`: generated views from YAML.
- `local-chat.md`: domain increments only.

## Editing Rules

- Do not manually edit `kernel/generated/*.md`.
- Edit `kernel/tables/*.yaml` first, then align kernel/domain docs in the same change.
- Keep no-legacy mode and no compatibility shim.

## Mandatory Verification

1. `pnpm -C nimi-mods run generate:spec:local-chat-kernel-docs`
2. `pnpm -C nimi-mods run check:spec:local-chat-kernel-docs-drift`
3. `pnpm -C nimi-mods run check:spec:local-chat-kernel-consistency`
