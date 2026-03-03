import {
  TEXTPLAY_DATA_API_CORE_AGENT_MEMORY_RECALL_FOR_ENTITY,
  TEXTPLAY_DATA_API_RENDER_PERSIST,
  TEXTPLAY_DATA_API_RUNTIME_ROUTE_OPTIONS,
  TEXTPLAY_DATA_API_WORLD_ACCESS_ME,
  TEXTPLAY_DATA_API_WORLD_WORLDS_MINE,
  TEXTPLAY_DATA_API_WORLD_EVENTS_LIST,
  TEXTPLAY_DATA_API_WORLD_LOREBOOKS_LIST,
  TEXTPLAY_DATA_API_WORLD_NARRATIVE_CONTEXTS_LIST,
  TEXTPLAY_DATA_API_WORLD_SCENES_LIST,
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
  author: { name: 'Nimi', url: 'https://nimi.xyz' },
  license: 'MIT',
  entry: './dist/mods/textplay/index.js',
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
        name: TEXTPLAY_DATA_API_RUNTIME_ROUTE_OPTIONS,
        description: 'Query runtime route options for renderer precondition checks',
      },
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
        name: TEXTPLAY_DATA_API_CORE_AGENT_MEMORY_RECALL_FOR_ENTITY,
        description: 'Read agent memory recall required by narrative compile context assembly',
      },
      {
        name: TEXTPLAY_DATA_API_RENDER_PERSIST,
        description: 'Persist and query textplay render records with run snapshots',
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
  },
} as const;
