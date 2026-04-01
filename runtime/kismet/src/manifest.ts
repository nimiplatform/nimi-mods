import {
  KISMET_CAPABILITIES,
  KISMET_MOD_ID,
  KISMET_NAV_SLOT,
  KISMET_ROUTE_SLOT,
} from './contracts.js';

export const KISMET_MANIFEST = {
  id: KISMET_MOD_ID,
  name: 'Kismet',
  version: '1.0.0',
  description: 'BaZi destiny analysis workbench with candlestick chart visualization',
  iconAsset: './assets/icon.svg',
  author: { name: 'Nimi', url: 'https://nimi.xyz' },
  license: 'MIT',
  entry: './dist/mods/kismet/index.js',
  styles: ['./dist/mods/kismet/index.css'],
  hash: 'default-kismet',
  nimi: {
    minVersion: '1.0.0',
    maxVersion: '2.x',
  },
  capabilities: [...KISMET_CAPABILITIES],
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
    profiles: [
      {
        id: 'kismet-default',
        title: 'Default analysis stack',
        description: 'Balanced local chat model for BaZi analysis.',
        recommended: true,
        consumeCapabilities: ['chat'],
        entries: [
          {
            entryId: 'kismet/chat-qwen2.5-7b',
            kind: 'asset',
            capability: 'chat',
            assetId: 'qwen2.5-7b-instruct',
            assetKind: 'chat',
            repo: 'Qwen/Qwen2.5-7B-Instruct-GGUF',
            engine: 'openai-compatible',
            title: 'Qwen2.5 7B Instruct (analysis)',
            required: true,
            preferred: true,
          },
        ],
      },
    ],
  },
  requires: ['desktop-core-cloud-chat'],
} as const;
