import {
  VIDEOPLAY_CAPABILITIES,
  VIDEOPLAY_DATA_API_CORE_AGENT_MEMORY_RECALL_FOR_ENTITY,
  VIDEOPLAY_DATA_API_ASSET_BATCH_UPSERT,
  VIDEOPLAY_DATA_API_EPISODE_UPSERT,
  VIDEOPLAY_DATA_API_RELEASE_PUBLISH,
  VIDEOPLAY_DATA_API_WORLD_EVENTS_LIST,
  VIDEOPLAY_DATA_API_WORLD_LOREBOOKS_LIST,
  VIDEOPLAY_DATA_API_WORLD_NARRATIVE_CONTEXTS_LIST,
  VIDEOPLAY_DATA_API_WORLD_SCENES_LIST,
  VIDEOPLAY_MOD_ID,
  VIDEOPLAY_NAV_SLOT,
  VIDEOPLAY_ROUTE_SLOT,
} from './contracts.js';

export const VIDEOPLAY_MANIFEST = {
  id: VIDEOPLAY_MOD_ID,
  name: 'VideoPlay',
  version: '1.1.0',
  description: 'Episode-scale narrative video production workbench',
  author: { name: 'Nimi', url: 'https://nimi.xyz' },
  license: 'MIT',
  entry: './dist/mods/videoplay/index.js',
  hash: 'default-videoplay',
  nimi: {
    minVersion: '1.0.0',
    maxVersion: '2.x',
  },
  capabilities: [...VIDEOPLAY_CAPABILITIES],
  dependencies: [],
  hooks: {
    dataApis: [
      {
        name: VIDEOPLAY_DATA_API_WORLD_EVENTS_LIST,
        description: 'Read world events for VideoStoryPackage catalog and entry mapping',
      },
      {
        name: VIDEOPLAY_DATA_API_WORLD_LOREBOOKS_LIST,
        description: 'Read world lorebooks for VideoStoryPackage materials',
      },
      {
        name: VIDEOPLAY_DATA_API_WORLD_SCENES_LIST,
        description: 'Read world scenes for VideoStoryPackage diagnostics and scene hints',
      },
      {
        name: VIDEOPLAY_DATA_API_WORLD_NARRATIVE_CONTEXTS_LIST,
        description: 'Read world narrative contexts for VideoStoryPackage scope coverage',
      },
      {
        name: VIDEOPLAY_DATA_API_CORE_AGENT_MEMORY_RECALL_FOR_ENTITY,
        description: 'Read memory recall for VideoStoryPackage materials',
      },
      {
        name: VIDEOPLAY_DATA_API_EPISODE_UPSERT,
        description: 'VideoPlay episode upsert/list/get operations',
      },
      {
        name: VIDEOPLAY_DATA_API_ASSET_BATCH_UPSERT,
        description: 'VideoPlay asset batch-upsert/list operations',
      },
      {
        name: VIDEOPLAY_DATA_API_RELEASE_PUBLISH,
        description: 'VideoPlay release publish/get/list operations',
      },
    ],
    uiExtensions: [
      {
        slot: VIDEOPLAY_NAV_SLOT,
        componentRef: 'videoplay:navigation-item',
      },
      {
        slot: VIDEOPLAY_ROUTE_SLOT,
        componentRef: 'videoplay:route-page',
      },
    ],
  },
  ai: {
    consume: ['chat', 'image', 'video', 'tts'],
    dependencies: {
      required: [
        {
          dependencyId: 'videoplay/chat-default',
          kind: 'model',
          capability: 'chat',
          engine: 'openai-compatible',
          title: 'Default Chat Model (runtime-resolved)',
        },
        {
          dependencyId: 'videoplay/image-default',
          kind: 'model',
          capability: 'image',
          engine: 'openai-compatible',
          title: 'Default Image Model (runtime-resolved)',
        },
        {
          dependencyId: 'videoplay/video-default',
          kind: 'model',
          capability: 'video',
          engine: 'openai-compatible',
          title: 'Default Video Model (runtime-resolved)',
        },
        {
          dependencyId: 'videoplay/tts-default',
          kind: 'model',
          capability: 'tts',
          engine: 'openai-compatible',
          title: 'Default TTS Model (runtime-resolved)',
        },
      ],
      preferred: {
        chat: 'videoplay/chat-default',
        image: 'videoplay/image-default',
        video: 'videoplay/video-default',
        tts: 'videoplay/tts-default',
      },
    },
  },
} as const;
