# Test-Chat-TTS Spec AGENTS

> Conventions for AI agents working under `nimi-mods/test-chat-tts/spec/`.

## Authoritative Structure

- `kernel/*.md`: Test-Chat-TTS cross-domain contracts (`TCT-*`).
- `kernel/tables/*.yaml`: authoritative fact sources.
- `kernel/generated/*.md`: generated views from YAML.
- `test-chat-tts.md`: domain increments only.

## Editing Rules

- Do not manually edit `kernel/generated/*.md`.
- Edit `kernel/tables/*.yaml` first, then align kernel/domain docs in the same change.
- Keep no-legacy mode and no compatibility shim.

## Mandatory Verification

1. `pnpm -C nimi-mods run generate:spec:test-chat-tts-kernel-docs`
2. `pnpm -C nimi-mods run check:spec:test-chat-tts-kernel-docs-drift`
3. `pnpm -C nimi-mods run check:spec:test-chat-tts-kernel-consistency`
