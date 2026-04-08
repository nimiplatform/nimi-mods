# Capability Contract

> Owner Domain: `VS-CAP-*`
> Authoritative fact source: `tables/capabilities.yaml`

## VS-CAP-001 — Mod Identity And Entry

- Mod ID: `world.nimi.audio-book`
- Entry: `./dist/mods/audio-book/index.js`
- Audio Book is a desktop capability mod and must consume runtime capabilities only through the mod SDK surface.

## VS-CAP-002 — Runtime AI / Config Capability

- `runtime.ai-config.get` / `runtime.ai-config.update` / `runtime.ai-config.subscribe` 是 Audio Book 唯一允许消费的 mod-scoped AI config authority surface。
- `runtime.ai-config.probe.scheduling.target` 用于读取 submit-target scheduling judgement，不能被 route helper 或本地启发式替代。
- `runtime.ai-snapshot.record` 用于通过 Desktop host authority 记录 canonical mod-scoped `AISnapshot`。
- Audio Book 的 chat route 与 TTS route 选择必须通过 canonical mod-scoped `AIConfig` 读写；`audio-book.route` 或其他 mod-local KV 不得再作为 live truth owner。
- `runtime.ai.text.generate` is the only text-generation capability Audio Book may consume.
- It is used for chapter analysis, character extraction, and voice recommendation.
- Audio Book must not declare or consume `runtime.ai.text.stream`.

## VS-CAP-003 — Runtime Route Contract

- Audio Book may query available route candidates via `runtime.route.list.options`.
- Audio Book may resolve route metadata via `runtime.route.resolve` for editor hydration and execution helper logic.
- `runtime.route.*` is projection/helper substrate only; it is not the canonical route/config owner.
- Route selection is capability-scoped; provider lists and legacy route hints are forbidden.

## VS-CAP-004 — Runtime TTS Capability

- Audio Book may consume `runtime.media.tts.list.voices` and `runtime.media.tts.synthesize` only after a binding has been selected.
- Voice listing is model-scoped and must fail close when no valid binding/model is available.
- Audio Book must not bypass runtime voice listing with provider-native HTTP calls.

## VS-CAP-005 — Hook Capability Surface

- UI registration is limited to:
  - `ui.register.ui-extension.app.sidebar.mods`
  - `ui.register.ui-extension.app.content.routes`
- Progress publication is limited to:
  - `event.publish.ab:synthesis:progress`
  - `event.subscribe.ab:synthesis:progress`
- Audio Book must not declare data APIs in its manifest.

## VS-CAP-006 — Allowed SDK Surface And Forbidden Patterns

- Allowed SDK packages:
  - `@nimiplatform/sdk/mod`
  - `@nimiplatform/sdk/mod/lifecycle`
- Forbidden patterns:
  - direct provider HTTP calls for TTS or voice discovery
  - legacy route-hint / route-override fields
  - direct desktop/runtime private imports
