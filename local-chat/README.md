# Desktop Local-Chat Mod

This mod contains local provider chat capabilities for desktop:

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

- Desktop core does not import local-chat runtime logic directly.
- Local-chat imports host integration only through `@nimiplatform/sdk/mod/*`.
- Model selection is not edited in local-chat page; it is resolved from `nimi.runtime.llm-config.v10` `routing.chat`.
- Model selection supports mod-owned override in local-chat page and does not overwrite global AI Runtime defaults.
- Data reads are GET-only. This mod performs no Nimi write operations.

Build/deploy convention (external mod):

- Manifest entry must point to bundle output: `./dist/mods/local-chat/index.js`.
- Source entry (`index.ts`) must export from JS path form: `./src/index.js`.
- Build command from `nimi-mods` root: `pnpm run build -- --mod local-chat`.
- Watch command from `nimi-mods` root: `pnpm run watch:local-chat`.
- Build output file: `local-chat/dist/mods/local-chat/index.js`.

Runtime mods directory strategy:

- Development: `NIMI_RUNTIME_MODS_DIR` is required and must be an absolute path.
- Recommended local joint-debug: `NIMI_RUNTIME_MODS_DIR == NIMI_MODS_ROOT`.
- Release default: `<app_data_dir>/mods`.
