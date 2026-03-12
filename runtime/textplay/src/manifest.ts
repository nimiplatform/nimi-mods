import {
  TEXTPLAY_CAPABILITIES,
  TEXTPLAY_DATA_API_CREATOR_AGENTS_LIST,
  TEXTPLAY_DATA_API_CORE_AGENT_MEMORY_RECALL_FOR_ENTITY,
  TEXTPLAY_DATA_API_WORLD_WORLDS_MINE,
  TEXTPLAY_DATA_API_WORLD_EVENTS_LIST,
  TEXTPLAY_DATA_API_WORLD_LOREBOOKS_LIST,
  TEXTPLAY_DATA_API_WORLD_NARRATIVE_CONTEXTS_LIST,
  TEXTPLAY_DATA_API_WORLD_SCENES_LIST,
  TEXTPLAY_DATA_API_WORLD_SPINE_PUBLISH,
  TEXTPLAY_MOD_ID,
  TEXTPLAY_NAV_SLOT,
  TEXTPLAY_ROUTE_SLOT,
} from './contracts.js';

export const TEXTPLAY_MANIFEST = {
  id: TEXTPLAY_MOD_ID,
  name: 'TextPlay',
  version: '1.0.0',
  description: 'Narrative text renderer for interactive story play',
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
  capabilities: [...TEXTPLAY_CAPABILITIES],
  dependencies: [],
  hooks: {
    dataApis: [
      {
        name: TEXTPLAY_DATA_API_WORLD_WORLDS_MINE,
        description: 'Read account world list required by entry selection',
      },
      {
        name: TEXTPLAY_DATA_API_WORLD_EVENTS_LIST,
        description: 'Read world event entry materials required by story start',
      },
      {
        name: TEXTPLAY_DATA_API_WORLD_LOREBOOKS_LIST,
        description: 'Read world lorebooks required by startup package assembly',
      },
      {
        name: TEXTPLAY_DATA_API_WORLD_SCENES_LIST,
        description: 'Read world scenes required by startup package assembly',
      },
      {
        name: TEXTPLAY_DATA_API_WORLD_NARRATIVE_CONTEXTS_LIST,
        description: 'Read narrative contexts required by story startup package and prompt policy assembly',
      },
      {
        name: TEXTPLAY_DATA_API_WORLD_SPINE_PUBLISH,
        description: 'Publish final narrative draft into story-scoped narrative spine on Stop',
      },
      {
        name: TEXTPLAY_DATA_API_CREATOR_AGENTS_LIST,
        description: 'Read creator agent profiles for entry agent selection',
      },
      {
        name: TEXTPLAY_DATA_API_CORE_AGENT_MEMORY_RECALL_FOR_ENTITY,
        description: 'Read agent memory recall required by narrative compile context assembly',
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
