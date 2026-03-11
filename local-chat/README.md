# Local-Chat Runtime Mod

This runtime mod provides hook-based local provider chat capabilities for the Desktop zero-bundle mod host:

- chat route execution through Hook LLM invoke (`scenario=chat`)
- chat route health probe through Hook LLM check
- read-only chat target list based on Agent friends (`listLocalChatTargets`)
- selected target lazy detail resolver with cache (`resolveLocalChatTargetDetail`)
- prompt construction from target agent + world + worldview context (`buildLocalChatPrompt`)
- hook data-api capabilities:
  - `data-api.local-chat.chat-targets.list`
  - `data-api.local-chat.chat-target.detail`
  - `data-api.local-chat.sessions.list`
  - `data-api.local-chat.sessions.get`
  - `data-api.local-chat.sessions.upsert`
  - `data-api.local-chat.sessions.delete`
- ui extension slot:
  - `ui-extension.app.sidebar.mods`
  - `ui-extension.app.content.routes`
  - `ui-extension.runtime.devtools.panel`
  - declares query-panel metadata and executes:
    - `data-api.local-chat.chat-targets.list`
    - `data-api.local-chat.chat-target.detail` (lazy, on selected target)
  - declares target-selection action to apply `agentId/worldId` runtime fields from query results

Design boundary:

- Desktop host does not import local-chat business logic directly.
- Local-chat imports host integration only through `@nimiplatform/sdk/mod/*`.
- Model selection is not edited in local-chat page; it is resolved from `nimi.runtime.llm-config.v10` `routing.chat`.
- Model selection supports mod-owned override in local-chat page and does not overwrite global AI Runtime defaults.
- Data reads are GET-only. This mod performs no Nimi write operations.

Build/deploy convention (external mod):

- Manifest entry must point to bundle output: `./dist/mods/local-chat/index.js`.
- Source entry (`index.ts`) must export from JS path form: `./src/index.js`.
- Build command from the mod directory: `pnpm build`.
- Dev/watch command from the mod directory: `pnpm dev`.
- Manifest/asset contract check from the mod directory: `pnpm doctor`.
- Prebuilt package from the mod directory: `pnpm pack`.
- Build output file: `local-chat/dist/mods/local-chat/index.js`.

Runtime mods directory strategy:

- Desktop release default: `~/.nimi/mods`.
- Desktop `Settings > Mod Developer` can add this mod directory itself as a `dev` source.
- Desktop-side development should happen in `Settings > Mod Developer`; `NIMI_RUNTIME_MODS_DIR` remains a compatibility path for CI/internal smoke only.
