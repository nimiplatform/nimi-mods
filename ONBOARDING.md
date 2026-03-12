# ONBOARDING

This document is for people who maintain `nimi-mods/` as a workspace, not for first-time external users.

If you are a third-party developer building your first mod, read `README.md` first.

This file is for:

- internal contributors
- maintainers reviewing mod architecture
- engineers migrating older mods to the current contract
- people adding new runtime mods to the workspace

## 1. Mental model

`nimi-mods/` is an external mod workspace.

It is not bundled into Desktop. Desktop is only the host.

Within this workspace there are three buckets:

- runtime mods in `runtime/*` and `pnpm-workspace.yaml`
- capability modules that participate in verification but are not loadable runtime mods
- audit-only directories outside the workspace contract

Current runtime mods:

- `audio-book`
- `buddy`
- `daily-outfit`
- `kismet`
- `knowledge-base`
- `local-chat`
- `mint-you`
- `test-ai`
- `textplay`
- `videoplay`
- `world-studio`

Capability module:

- `narrative-engine`

Audit-only:

- `cashbook`
- `meeting-scribe`
- `re-life`

## 2. Rules that matter before editing code

Read these first:

1. `AGENTS.md`
2. target mod `spec/AGENTS.md`
3. target mod `mod.manifest.yaml`
4. target mod `package.json`
5. target mod `src/runtime-mod.ts`

Non-negotiable boundaries:

- mods must stay on `@nimiplatform/sdk/mod`, plus `@nimiplatform/sdk/mod/shell` or `@nimiplatform/sdk/mod/lifecycle` only when needed
- mods must not bypass hook/runtime boundaries
- runtime UI mods must declare `styles[]`
- no `../../sdk/src` path aliases
- lifecycle side effects must be cleanable by `teardown`

## 3. Workspace contract

Runtime mods are expected to have:

```text
nimi-mods/runtime/<mod>/
├── index.ts
├── mod.manifest.yaml
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── src/
├── spec/
└── dist/mods/<mod>/
```

Expected runtime package scripts:

- `build`
- `dev`
- `doctor`
- `pack`

Expected build outputs:

- `./dist/mods/<mod>/index.js`
- `./dist/mods/<mod>/index.css` for UI mods

## 4. Shared systems in this workspace

Important shared pieces:

- `scripts/check-mods.mjs`
  - workspace contract validation
- `scripts/check-mod-style-consistency.mjs`
  - style/root/portal consistency validation
- `shared/ui-sync-visual-styles.tsx`
  - shared visual baseline for mods using the `ui-sync` design system
- `../dev-tools/lib/index.mjs`
  - mod authoring baseline, Tailwind/theme generation, CSS compatibility layer

When you change one of these, assume multiple mods are affected.

## 5. Verification flow

Default workspace verification:

```bash
pnpm run check
pnpm run check:spec
pnpm run typecheck
pnpm run verify
```

Targeted checks:

```bash
pnpm run check:styles
pnpm run check:dist
pnpm --filter @nimiplatform/mod-local-chat run verify
pnpm --filter @nimiplatform/mod-buddy run doctor
```

Use `verify` when:

- changing shared scripts
- changing shared styling baseline
- changing package/manifest contracts
- changing runtime lifecycle behavior

## 6. Desktop-side development flow

Supported path:

1. build or watch the mod from this workspace
2. use `Settings > Mod Developer` in Desktop
3. add `nimi-mods/runtime` or one specific `nimi-mods/runtime/<mod>` directory as a dev source
4. reload the source after changes

Environment-variable paths are compatibility-only and should not be documented as the primary third-party path.

## 7. Styling model after Desktop separation

Desktop used to provide more implicit page styling. That is no longer safe to assume.

Current expectations:

- UI runtime mods ship their own CSS
- manifest must declare `styles[]`
- page roots must declare `data-nimi-mod-root="<mod-name>"`
- portal surfaces must declare `data-nimi-mod-portal="<mod-name>"`

When auditing style regressions, check in this order:

1. did the mod build CSS get emitted?
2. does the manifest declare the CSS?
3. does the page root have the correct marker?
4. do portal surfaces have the correct marker?
5. is the mod still depending on a host-global reset, token, or font?

## 8. Lifecycle model

Every runtime mod should be safe under:

- initial load
- reload
- unload
- load again

`teardown` should clean:

- timers
- intervals
- retained runtime clients
- cached context
- media objects
- global script loaders
- renderer-only singletons

Recent examples:

- `local-chat`: heartbeat cleanup
- `buddy`: Cubism loader and SDK context reset
- `world-studio`: runtime client reset
- `test-ai`: runtime client reset

## 9. Adding a new runtime mod to the workspace

Checklist:

1. Create the package directory under `runtime/<mod>` with the required file layout.
2. Add it to `pnpm-workspace.yaml`.
3. Add root script coverage in `package.json`:
   - `generate:spec:<mod>-kernel-docs`
   - `check:spec:<mod>`
   - `verify:<mod>` if appropriate
   - `typecheck/build/clean` aggregations
4. Add package-local scripts:
   - `build/dev/doctor/pack`
5. Add manifest `entry` and `styles[]`.
6. Add `spec/**`.
7. Make `check`, `check:spec`, and `verify` pass.

## 10. Converting an older mod

If you are migrating an older mod, the usual work is:

1. replace old custom build scripts with `nimi-mod`
2. add explicit `react`, `@nimiplatform/sdk`, and `@nimiplatform/dev-tools` deps
3. remove `tsconfig` path aliases into monorepo source
4. add `styles[]`
5. add `data-nimi-mod-root`
6. add portal markers if needed
7. add `teardown`

## 11. Spec workflow

Each mod owns its own spec under `runtime/<mod>/spec/**` or `modules/<pkg>/spec/**`.

Generated kernel docs must stay in sync.

Useful commands:

```bash
pnpm run generate:spec
pnpm run check:spec
```

Single-mod examples:

```bash
pnpm run generate:spec:buddy-kernel-docs
pnpm run check:spec:buddy
```

## 12. Common maintenance failures

`check-mods` fails on manifest entry

- output path drifted from `./dist/mods/<mod>/index.js`

`check-mod-style-consistency` fails on root marker

- page root is missing `data-nimi-mod-root`

`check-mod-style-consistency` fails on portal marker

- dialog/select/tooltip content is rendered through a portal without `data-nimi-mod-portal`

reload duplicates behavior

- `teardown` is incomplete

UI looks correct in one host state but not another

- mod still depends on old Desktop global styling or shell container assumptions

tests fail after SDK package migration

- old test harnesses still import from `../../sdk/src/*`

## 13. Suggested review checklist

When reviewing a mod change, check:

- package scripts are present
- manifest `entry` and `styles[]` are correct
- root/portal style markers are present
- no Desktop-private imports were added
- no runtime SDK bypass was added
- `teardown` exists and actually cleans state
- spec and generated docs stay aligned
- root `check` still passes

## 14. Handoff checklist

Before handing a change to someone else:

- explain whether it affects one mod or shared authoring rules
- note whether Desktop manual verification was done
- list any remaining manual checks
- keep the workspace green with `check` at minimum
- use `verify` if shared or lifecycle behavior changed
