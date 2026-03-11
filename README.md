# Nimi Mods

`nimi-mods/` is the example and authoring workspace for Nimi runtime mods.

If you are a third-party developer and want to build your first mod, start here.

If you are working inside the Nimi monorepo and need the deeper maintenance rules, read `ONBOARDING.md` after this file.

## What is a Nimi mod?

A Nimi mod is a small package that Desktop can load at runtime.

Typical things a mod can do:

- add a page to the app
- add a sidebar entry
- call AI capabilities through the mod SDK
- store mod-local state
- register hook-based data or UI integrations

Important constraint:

- a mod talks to Nimi through the public mod SDK
- a mod does not import Desktop private code

## What you need

Before you start, make sure you have:

- Node.js `24+`
- `pnpm 10+`
- access to the Nimi monorepo
- Nimi Desktop available locally

Install dependencies once:

```bash
cd nimi-mods
pnpm install
```

## Fastest way to understand the workspace

These directories are already working examples:

- `test-ai`: small diagnostic UI mod, easiest starting point for a page-style mod
- `local-chat`: large production-style runtime mod
- `kismet`: immersive full-screen mod page
- `buddy`: animated character mod with more complex runtime cleanup

## Runtime mods in this workspace

Loadable runtime mods:

- `audio-book`
- `buddy`
- `kismet`
- `knowledge-base`
- `local-chat`
- `mint-you`
- `test-ai`
- `textplay`
- `videoplay`
- `world-studio`

Non-loadable support package:

- `narrative-engine`

Not part of the runtime workspace contract:

- `cashbook`
- `meeting-scribe`
- `re-life`

## Your first successful mod run

The simplest path is:

1. Pick an existing mod, for example `test-ai`
2. Build it
3. Add the mod folder to Desktop
4. Reload it after changes

Build:

```bash
cd nimi-mods/test-ai
pnpm run build
```

Validate:

```bash
pnpm run doctor
```

Load in Desktop:

1. Open Desktop
2. Go to `Settings > Mod Developer`
3. Add either:
   - the whole `nimi-mods/` directory, or
   - one specific mod directory such as `nimi-mods/test-ai`
4. Reload the source after every rebuild

## The minimum file layout

A basic runtime mod should look like this:

```text
my-mod/
├── index.ts
├── mod.manifest.yaml
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── src/
│   ├── index.ts
│   ├── runtime-mod.ts
│   └── my-page.tsx
└── spec/
```

## The minimum package scripts

Your `package.json` should expose:

```json
{
  "scripts": {
    "build": "nimi-mod build",
    "dev": "nimi-mod dev",
    "doctor": "nimi-mod doctor",
    "pack": "nimi-mod pack"
  }
}
```

## The minimum manifest

Your `mod.manifest.yaml` should have at least:

```yaml
id: world.nimi.my-mod
name: My Mod
version: 0.1.0
kind: capability-mod
entry: ./dist/mods/my-mod/index.js
styles:
  - ./dist/mods/my-mod/index.css
capabilities:
  - ui.register.ui-extension.app.sidebar.mods
  - ui.register.ui-extension.app.content.routes
```

Notes:

- `entry` must point to the built JS file
- UI mods must also declare `styles`
- capabilities must be explicit; do not use wildcard grants

## The minimum runtime registration

Example `src/runtime-mod.ts`:

```ts
import type { RuntimeModRegistration } from '@nimiplatform/sdk/mod/types';
import { createHookClient } from '@nimiplatform/sdk/mod/hook';

const MOD_ID = 'world.nimi.my-mod';

export function createRuntimeMod(): RuntimeModRegistration {
  return {
    modId: MOD_ID,
    capabilities: [
      'ui.register.ui-extension.app.sidebar.mods',
      'ui.register.ui-extension.app.content.routes',
    ],
    setup: async ({ sdkRuntimeContext }) => {
      const hookClient = createHookClient(MOD_ID, sdkRuntimeContext);

      await hookClient.ui.register({
        slot: 'ui-extension.app.sidebar.mods',
        priority: 100,
        extension: {
          type: 'nav-item',
          tabId: 'mod:my-mod',
          label: 'My Mod',
          icon: 'puzzle',
          strategy: 'append',
        },
      });

      await hookClient.ui.register({
        slot: 'ui-extension.app.content.routes',
        priority: 100,
        extension: {
          type: 'tab-page',
          tabId: 'mod:my-mod',
          strategy: 'append',
          component: async () => null,
        },
      });
    },
    teardown: async () => {},
  };
}
```

## The minimum page root

If your mod renders UI, the page root must include a mod root marker:

```tsx
export function MyPage() {
  return (
    <div data-nimi-mod-root="my-mod" className="h-full min-h-0">
      Hello from My Mod
    </div>
  );
}
```

Why this matters:

- Desktop no longer supplies the old implicit page styling
- your mod's built CSS uses this marker to scope its baseline styles

If you use portal UI like dialogs or tooltips, the portal content also needs a mod portal marker:

```tsx
<div data-nimi-mod-portal="my-mod">...</div>
```

## What imports are allowed?

Use these in mod code:

- `@nimiplatform/sdk/mod/hook`
- `@nimiplatform/sdk/mod/runtime`
- `@nimiplatform/sdk/mod/types`
- other `@nimiplatform/sdk/mod/*` subpaths when needed

Avoid these in runtime mod source:

- `@nimiplatform/sdk`
- `@nimiplatform/sdk/runtime`
- `@tauri-apps/*`
- Desktop source imports
- `../../sdk/src/*`

## Build and validation commands

Inside one mod:

```bash
pnpm run dev
pnpm run build
pnpm run doctor
pnpm run pack
```

At the `nimi-mods/` root:

```bash
pnpm run check
pnpm run check:spec
pnpm run typecheck
pnpm run build
pnpm run verify
```

What they mean:

- `check`: package/manifest/style contract checks
- `check:spec`: spec consistency checks
- `typecheck`: TypeScript checks across the workspace
- `build`: builds all runtime mods
- `verify`: full tests plus build checks

## Most common beginner problems

### Desktop does not show my mod

Check:

- did you add the correct folder in `Settings > Mod Developer`?
- did `pnpm run build` succeed?
- does `mod.manifest.yaml` point to `./dist/mods/<mod>/index.js`?

### Desktop loads the mod but the page looks unstyled

Check:

- does the manifest declare `styles:`?
- does the page root have `data-nimi-mod-root="<mod-name>"`?
- did you reload the dev source after rebuild?

### Dialogs or tooltips look broken

Check:

- does the portal content include `data-nimi-mod-portal="<mod-name>"`?

### Reloading the mod causes duplicate timers or duplicate requests

Check:

- did you clean long-lived state in `teardown`?

### TypeScript works only on your machine

Check:

- remove old `tsconfig` path aliases to `../../sdk/src`
- depend on `@nimiplatform/sdk` through `package.json`

## Recommended way to learn

If this is your first mod:

1. Read `test-ai`
2. Copy its basic package/manifest/runtime structure
3. Add one simple page
4. Make `pnpm run doctor` pass
5. Load it in Desktop

## Where to go next

- For internal workspace and maintenance rules: `ONBOARDING.md`
- For strict workspace conventions: `AGENTS.md`
- For a specific mod contract: `<mod>/spec/AGENTS.md`
