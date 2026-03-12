# Mods AGENTS.md

> Conventions for AI agents working on `nimi-mods/*`.

## Context

`nimi-mods/` is an optional external workspace for example mods, test inputs, and reusable authoring fixtures.
`@nimiplatform/desktop` is a zero-bundle host and does not ship `nimi-mods` contents as built-in product mods.

Desktop loads mods from installed/runtime source directories. During local authoring, the primary Desktop-side flow is App UI only: `Settings > Mod Developer` to add or manage a dev source directory.

Mods run in desktop-governed hook runtime and must not call runtime SDK directly.

## Workspace Layout

`nimi-mods/` root is reserved for workspace infrastructure only:

- `runtime/*` for runtime-loadable mods
- `modules/*` for capability modules
- `audit/*` for audit-only packages outside the workspace contract
- `scripts/`, `shared/`, `spec/`, and `dev/` for shared infrastructure

Do not add new mod/package directories directly under the `nimi-mods/` root.

## Required File Shape

```
nimi-mods/runtime/<mod-name>/
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

Each runtime mod owns its own business spec in `nimi-mods/runtime/<mod-name>/spec/**`.
Cross-mod contracts live in `nimi-mods/spec/mod/**`.

## Registration Contract

Entry must export a runtime mod factory:

- preferred: `createRuntimeMod`
- accepted fallback: `create*RuntimeMod` (matched by discovery regex)

Factory returns `RuntimeModRegistration` and typically performs:

- `createHookClient(modId)` for hook subsystems
- `createModRuntimeClient(modId)` for runtime-aligned AI/media/voice facade

## Manifest Contract (Current Runtime)

Manifest is consumed by desktop runtime (`apps/desktop/src-tauri/src/runtime_mod/store.rs` + `apps/desktop/src/runtime/mod/discovery/manifest-capabilities.ts`).

- required: `id`, `version`, `entry`, `capabilities`
- optional: `name`, `description`, `dependencies`, `hooks`, `ai`, `icon`, `iconAsset`, `kind`
- `entry` must align with current build output: `./dist/mods/<mod-name>/index.js`
- `iconAsset`, if present, must be a package-local relative `.svg` path and will be packed/cataloged for Desktop icon rendering

Use explicit capability keys (see `apps/desktop/src/runtime/mod/discovery/manifest-capabilities.ts` for current format). Do not use wildcard grants.

## SDK Imports

Use the stable mod business surface from `@nimiplatform/sdk/mod`.
Use dedicated facades only when needed:

- `@nimiplatform/sdk/mod`
- `@nimiplatform/sdk/mod/shell`
- `@nimiplatform/sdk/mod/lifecycle`

Do not use `@nimiplatform/sdk/mod/ui`, `@nimiplatform/sdk/mod/host`, or any SDK internal source path in mod business code.

## Prohibited Imports / APIs

- `@nimiplatform/sdk`, `@nimiplatform/sdk/runtime`
- `@tauri-apps/*`
- Node builtins (`node:fs`, `node:net`, `node:child_process`, etc.)
- dynamic execution (`eval`, `new Function`)

## Hook API (V2)

Use `hook.<domain>` and `runtime.<domain>` clients from `@nimiplatform/sdk/mod`. Do not use legacy `hook.eventBus` / `hook.dataApi` / `hook.uiExtension` naming.

## Build and Dev Commands

Author workflows belong to `@nimiplatform/dev-tools` via the `nimi-mod` CLI. Prefer each mod's package-local scripts:

```bash
pnpm run dev
pnpm run build
pnpm run doctor
pnpm run pack
```

Workspace-level verification still lives at the `nimi-mods` root:

```bash
pnpm run check
pnpm run check:spec
pnpm run verify
```

## Quality Rules

- ESM imports use `.js` extension
- Keep mod IDs stable once published/installed
- Keep runtime registration capabilities aligned with manifest capabilities
- Add concise runtime logs for setup/critical flows
- Ensure setup side effects can be cleaned by lifecycle unregister path

## Layered Entry/Exit (MUST)

- Mod-side debugging is last-mile only: runtime + sdk gates must be green first.
- When AI calls fail, retain and surface upstream `reasonCode`/`traceId`; do not mask failures with mod-only fallback shims.
- Do not bypass `nimi-hook` or add hardcoded runtime/sdk compatibility branches to force local success.
- `local-chat` deterministic E2E is required in PR scope; live smoke is required in nightly/release scope.
