import {
  AUDIO_BOOK_MOD_ID,
  AUDIO_BOOK_NAV_SLOT,
  AUDIO_BOOK_PERMISSIONS,
  AUDIO_BOOK_ROUTE_SLOT,
} from './contracts.js';

export const AUDIO_BOOK_MANIFEST = {
  id: AUDIO_BOOK_MOD_ID,
  name: 'Audio Book',
  version: '0.1.0',
  description: 'Multi-character AI voice narration and audiobook generation',
  author: { name: 'Nimi', url: 'https://nimi.xyz' },
  license: 'MIT',
  entry: './dist/mods/audio-book/index.js',
  hash: 'default-audio-book',
  nimi: {
    minVersion: '1.0.0',
    maxVersion: '2.x',
  },
  capabilities: [...AUDIO_BOOK_PERMISSIONS],
  dependencies: [],
  hooks: {
    uiExtensions: [
      {
        slot: AUDIO_BOOK_NAV_SLOT,
        componentRef: 'audio-book:navigation-item',
      },
      {
        slot: AUDIO_BOOK_ROUTE_SLOT,
        componentRef: 'audio-book:route-page',
      },
    ],
  },
  ai: {
    consume: ['chat', 'speech'],
    dependencies: {
      required: [
        {
          dependencyId: 'audio-book/chat-qwen2.5-7b',
          kind: 'model',
          capability: 'chat',
          modelId: 'qwen2.5-7b-instruct',
          repo: 'Qwen/Qwen2.5-7B-Instruct-GGUF',
          engine: 'openai-compatible',
          title: 'Qwen2.5 7B Instruct (analysis)',
        },
      ],
      optional: [
        {
          dependencyId: 'audio-book/tts-token-node',
          kind: 'node',
          capability: 'speech',
          nodeId: 'speech.synthesize.cloud',
          title: 'Token API TTS node',
        },
      ],
      preferred: {
        chat: 'audio-book/chat-qwen2.5-7b',
      },
    },
  },
} as const;
