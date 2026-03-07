import {
  KISMET_MOD_ID,
  KISMET_NAV_SLOT,
  KISMET_ROUTE_SLOT,
  KISMET_PERMISSIONS,
} from './contracts.js';

export const KISMET_MANIFEST = {
  id: KISMET_MOD_ID,
  name: 'Kismet',
  version: '1.0.0',
  description: 'BaZi destiny analysis workbench with candlestick chart visualization',
  icon: 'kismet',
  author: { name: 'Nimi', url: 'https://nimi.xyz' },
  license: 'MIT',
  entry: './dist/mods/kismet/index.js',
  hash: 'default-kismet',
  nimi: {
    minVersion: '1.0.0',
    maxVersion: '2.x',
  },
  capabilities: [...KISMET_PERMISSIONS],
  dependencies: [],
  hooks: {
    dataApis: [],
    uiExtensions: [
      {
        slot: KISMET_NAV_SLOT,
        componentRef: 'kismet:navigation-item',
      },
      {
        slot: KISMET_ROUTE_SLOT,
        componentRef: 'kismet:route-page',
      },
    ],
  },
  ai: {
    consume: ['chat'],
    dependencies: {
      required: [
        {
          dependencyId: 'kismet/chat-qwen2.5-7b',
          kind: 'model',
          capability: 'chat',
          modelId: 'qwen2.5-7b-instruct',
          repo: 'Qwen/Qwen2.5-7B-Instruct-GGUF',
          engine: 'openai-compatible',
          title: 'Qwen2.5 7B Instruct (analysis)',
        },
      ],
      preferred: {
        chat: 'kismet/chat-qwen2.5-7b',
      },
    },
  },
  requires: ['desktop-core-cloud-chat'],
} as const;
