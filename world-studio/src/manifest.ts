import {
  WORLD_STUDIO_MOD_ID,
  WORLD_STUDIO_NAV_SLOT,
  WORLD_STUDIO_PERMISSIONS,
  WORLD_STUDIO_ROUTE_SLOT,
} from './contracts.js';

export const WORLD_STUDIO_MANIFEST = {
  id: WORLD_STUDIO_MOD_ID,
  name: 'World Studio',
  version: '1.0.0',
  description: 'World creation and maintenance studio built on unified world APIs',
  author: { name: 'Nimi', url: 'https://nimi.xyz' },
  license: 'MIT',
  entry: './dist/mods/world-studio/index.js',
  hash: 'default-world-studio',
  nimi: {
    minVersion: '1.0.0',
    maxVersion: '2.x',
  },
  capabilities: [...WORLD_STUDIO_PERMISSIONS],
  dependencies: [],
  hooks: {
    uiExtensions: [
      {
        slot: WORLD_STUDIO_NAV_SLOT,
        componentRef: 'world-studio:navigation-item',
      },
      {
        slot: WORLD_STUDIO_ROUTE_SLOT,
        componentRef: 'world-studio:route-page',
      },
    ],
  },
  ai: {
    consume: ['chat', 'image'],
    dependencies: {
      required: [
        {
          dependencyId: 'world-studio/chat-qwen2.5-7b',
          kind: 'model',
          capability: 'chat',
          modelId: 'qwen2.5-7b-instruct',
          repo: 'Qwen/Qwen2.5-7B-Instruct-GGUF',
          engine: 'openai-compatible',
          title: 'Qwen2.5 7B Instruct (default)',
        },
      ],
      optional: [
        {
          dependencyId: 'world-studio/image-token-node',
          kind: 'node',
          capability: 'image',
          nodeId: 'image.generate.cloud',
          title: 'Cloud image generation node',
        },
      ],
      preferred: {
        chat: 'world-studio/chat-qwen2.5-7b',
      },
    },
  },
} as const;
