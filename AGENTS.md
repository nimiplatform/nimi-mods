# Mods AGENTS.md

> Conventions for AI agents working on `nimi-mods/*`.

## Context

`nimi-mods/` stores first-party runtime mods loaded by `@nimiplatform/desktop`.
Current built-in examples: `local-chat`, `kismet`, `re-life`, `world-studio`.

Mods run in desktop-governed hook runtime and must not call runtime SDK directly.

## Required File Shape

```
nimi-mods/<mod-name>/
├── index.ts
├── spec/
│   ├── AGENTS.md
│   ├── INDEX.md
│   ├── <mod-name>.md
│   └── kernel/
│       ├── *.md
│       ├── tables/*.yaml
│       └── generated/*.md
├── src/
│   └── ...
├── dist/
│   └── mods/<mod-name>/index.js
├── mod.manifest.yaml
├── package.json
├── tsconfig.json
└── tsconfig.build.json
```

Each mod owns its own business spec in `nimi-mods/<mod-name>/spec/**`.
Cross-mod contracts live in `nimi-mods/spec/mod/**`.

## Registration Contract

Entry must export a runtime mod factory:

- preferred: `createRuntimeMod`
- accepted fallback: `create*RuntimeMod` (matched by discovery regex)

Factory returns `RuntimeModRegistration` and typically performs:

- `createHookClient(modId)` for hook subsystems
- `createAiClient(modId)` for route-aware AI facade

## Manifest Contract (Current Runtime)

Manifest is consumed by desktop runtime (`apps/desktop/src-tauri/src/runtime_mod/store.rs` + `apps/desktop/src/runtime/mod/discovery/manifest-capabilities.ts`).

- required: `id`, `version`, `entry`, `capabilities`
- optional: `name`, `description`, `dependencies`, `hooks`, `ai`, `icon`, `kind`
- `entry` must align with current build output: `./dist/mods/<mod-name>/index.js`

Current built-in manifest style uses capability keys like:

- `llm.text.generate`
- `data.register.data-api.local-chat.sessions.list`
- `data.query.data-api.local-chat.sessions.list`
- `ui.register.ui-extension.app.sidebar.mods`

Use explicit capability keys. Do not use wildcard grants.

## SDK Imports

Use subpath imports from `@nimiplatform/sdk/mod`:

- `@nimiplatform/sdk/mod/hook`
- `@nimiplatform/sdk/mod/ai`
- `@nimiplatform/sdk/mod/types`
- `@nimiplatform/sdk/mod/ui`
- `@nimiplatform/sdk/mod/logging`
- `@nimiplatform/sdk/mod/i18n`
- `@nimiplatform/sdk/mod/settings`
- `@nimiplatform/sdk/mod/utils`

Avoid root import (`@nimiplatform/sdk/mod`) in mod code.
`@nimiplatform/sdk/mod/host` is host wiring surface, not mod business API.

## Prohibited Imports / APIs

- `@nimiplatform/sdk`, `@nimiplatform/sdk/runtime`
- `@tauri-apps/*`
- Node builtins (`node:fs`, `node:net`, `node:child_process`, etc.)
- dynamic execution (`eval`, `new Function`)

## Hook API (V2)

Use `hook.<domain>` clients:

- `hook.event.subscribe/publish`
- `hook.data.register/query`
- `hook.ui.register`
- `hook.turn.register`
- `hook.interMod.registerHandler/request`
- `hook.llm.*` (text/image/video/embedding/speech/health)
- `hook.audit`, `hook.meta`

Do not use legacy `hook.eventBus` / `hook.dataApi` / `hook.uiExtension` naming.

## Build and Dev Commands

Use `nimi-mods` scripts as source of truth:

```bash
pnpm run check
pnpm run check:spec
pnpm run build -- --mod local-chat
pnpm run watch:local-chat
pnpm run verify
```

Desktop integration in local dev is env-driven:

```bash
export NIMI_MODS_ROOT=/ABS/PATH/TO/nimi-mods
export NIMI_RUNTIME_MODS_DIR="$NIMI_MODS_ROOT"
```

## Quality Rules

- ESM imports use `.js` extension
- Keep mod IDs stable once published/installed
- Keep runtime registration capabilities aligned with manifest capabilities
- Add concise runtime logs for setup/critical flows
- Ensure setup side effects can be cleaned by lifecycle unregister path
