import {
  WORLD_STUDIO_CAPABILITIES,
  WORLD_STUDIO_MOD_ID,
  WORLD_STUDIO_NAV_SLOT,
  WORLD_STUDIO_ROUTE_SLOT,
} from './contracts.js';

export const WORLD_STUDIO_MANIFEST = {
  id: WORLD_STUDIO_MOD_ID,
  name: 'World Studio',
  version: '1.0.0',
  description: 'World creation and maintenance studio built on unified world APIs',
  iconAsset: './assets/icon.svg',
  author: { name: 'Nimi', url: 'https://nimi.xyz' },
  license: 'MIT',
  entry: './dist/mods/world-studio/index.js',
  styles: ['./dist/mods/world-studio/index.css'],
  hash: 'default-world-studio',
  nimi: {
    minVersion: '1.0.0',
    maxVersion: '2.x',
  },
  capabilities: [...WORLD_STUDIO_CAPABILITIES],
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
    profiles: [
      {
        id: 'world-studio-default',
        title: 'Default studio stack',
        description: 'Balanced world-building stack with local chat and image generation node.',
        recommended: true,
        consumeCapabilities: ['chat', 'image'],
        entries: [
          {
            entryId: 'world-studio/chat-qwen2.5-7b',
            kind: 'asset',
            capability: 'chat',
            assetId: 'qwen2.5-7b-instruct',
            assetKind: 'chat',
            repo: 'Qwen/Qwen2.5-7B-Instruct-GGUF',
            engine: 'openai-compatible',
            title: 'Qwen2.5 7B Instruct (default)',
            required: true,
            preferred: true,
          },
          {
            entryId: 'world-studio/image-token-node',
            kind: 'node',
            capability: 'image',
            nodeId: 'image.generate.cloud',
            title: 'Cloud image generation node',
            required: true,
          },
        ],
      },
    ],
  },
} as const;
