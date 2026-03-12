import {
  TEXTPLAY_DATA_API_CORE_AGENT_MEMORY_RECALL_FOR_ENTITY,
  TEXTPLAY_DATA_API_RENDER_PERSIST,
  TEXTPLAY_DATA_API_SESSIONS_MINE,
  TEXTPLAY_DATA_API_WORLD_ACCESS_ME,
  TEXTPLAY_DATA_API_WORLD_WORLDS_MINE,
  TEXTPLAY_DATA_API_WORLD_EVENTS_LIST,
  TEXTPLAY_DATA_API_WORLD_LOREBOOKS_LIST,
  TEXTPLAY_DATA_API_WORLD_NARRATIVE_CONTEXTS_LIST,
  TEXTPLAY_DATA_API_WORLD_SCENES_LIST,
  TEXTPLAY_DATA_API_WORLD_SATELLITES_BY_SPINE_LIST,
  TEXTPLAY_DATA_API_WORLD_SATELLITES_CREATE,
  TEXTPLAY_DATA_API_WORLD_SPINE_GET_OR_CREATE,
  TEXTPLAY_MOD_ID,
  TEXTPLAY_NAV_SLOT,
  TEXTPLAY_PERMISSIONS,
  TEXTPLAY_ROUTE_SLOT,
} from './contracts.js';

export const TEXTPLAY_MANIFEST = {
  id: TEXTPLAY_MOD_ID,
  name: 'TextPlay',
  version: '1.0.0',
  description: 'Narrative text renderer for interactive story play',
  icon: 'textplay',
  iconAsset: './assets/icon.svg',
  author: { name: 'Nimi', url: 'https://nimi.xyz' },
  license: 'MIT',
  entry: './dist/mods/textplay/index.js',
  styles: ['./dist/mods/textplay/index.css'],
  hash: 'default-textplay',
  nimi: {
    minVersion: '1.0.0',
    maxVersion: '2.x',
  },
  capabilities: [...TEXTPLAY_PERMISSIONS],
  dependencies: [],
  hooks: {
    dataApis: [
      {
        name: TEXTPLAY_DATA_API_WORLD_ACCESS_ME,
        description: 'Read world access contract required by narrative compile context assembly',
      },
      {
        name: TEXTPLAY_DATA_API_WORLD_WORLDS_MINE,
        description: 'Read account world list required by world-first playable story selection',
      },
      {
        name: TEXTPLAY_DATA_API_WORLD_EVENTS_LIST,
        description: 'Read world event facts required by narrative compile context assembly',
      },
      {
        name: TEXTPLAY_DATA_API_WORLD_LOREBOOKS_LIST,
        description: 'Read world lorebook facts required by narrative compile context assembly',
      },
      {
        name: TEXTPLAY_DATA_API_WORLD_SCENES_LIST,
        description: 'Read world scene context required by story startup package assembly',
      },
      {
        name: TEXTPLAY_DATA_API_WORLD_NARRATIVE_CONTEXTS_LIST,
        description: 'Read narrative contexts required by story startup package and prompt policy assembly',
      },
      {
        name: TEXTPLAY_DATA_API_WORLD_SPINE_GET_OR_CREATE,
        description: 'Resolve canonical narrative spine id for world+agent persistence scope',
      },
      {
        name: TEXTPLAY_DATA_API_WORLD_SATELLITES_BY_SPINE_LIST,
        description: 'Read persisted run snapshots by narrative spine scope',
      },
      {
        name: TEXTPLAY_DATA_API_WORLD_SATELLITES_CREATE,
        description: 'Write persisted run snapshots as narrative satellites',
      },
      {
        name: TEXTPLAY_DATA_API_CORE_AGENT_MEMORY_RECALL_FOR_ENTITY,
        description: 'Read agent memory recall required by narrative compile context assembly',
      },
      {
        name: TEXTPLAY_DATA_API_RENDER_PERSIST,
        description: 'Persist and query textplay render records with run snapshots',
      },
      {
        name: TEXTPLAY_DATA_API_SESSIONS_MINE,
        description: 'Read paginated history sessions for continue flow via single-query aggregation',
      },
    ],
    uiExtensions: [
      {
        slot: TEXTPLAY_NAV_SLOT,
        componentRef: 'textplay:navigation-item',
      },
      {
        slot: TEXTPLAY_ROUTE_SLOT,
        componentRef: 'textplay:route-page',
      },
    ],
  },
  ai: {
    consume: ['chat'],
    dependencies: {
      required: [
        {
          dependencyId: 'textplay/chat-default',
          kind: 'model',
          capability: 'chat',
          engine: 'openai-compatible',
          title: 'Default Chat Model (runtime-resolved)',
        },
      ],
      preferred: {
        chat: 'textplay/chat-default',
      },
    },
  },
} as const;
