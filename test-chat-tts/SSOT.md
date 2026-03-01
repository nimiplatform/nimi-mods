# Test Chat TTS Mod SSOT

## Scope

- This mod is a minimal diagnostics surface for two capabilities only:
  - chat text generation
  - speech synthesis (TTS)

## Invariants

- Mod ID is `world.nimi.test-chat-tts` and must remain stable once referenced by desktop resources.
- Manifest entry must remain `./dist/mods/test-chat-tts/index.js`.
- Capability set must remain aligned with runtime registration and include only:
  - `llm.text.generate`
  - `llm.speech.providers.list`
  - `llm.speech.voices.list`
  - `llm.speech.synthesize`
  - `data.query.data-api.runtime.route.options`
  - `ui.register.ui-extension.app.sidebar.mods`
  - `ui.register.ui-extension.app.content.routes`

## Acceptance Gates

- `pnpm -C nimi-mods run check`
- `pnpm -C nimi-mods --filter @nimiplatform/mod-test-chat-tts run typecheck`
- `pnpm -C nimi-mods run build -- --mod test-chat-tts`
