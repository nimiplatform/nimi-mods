import {
  VOICE_STUDIO_MOD_ID,
  VOICE_STUDIO_NAV_SLOT,
  VOICE_STUDIO_PERMISSIONS,
  VOICE_STUDIO_ROUTE_SLOT,
} from './contracts.js';

export const VOICE_STUDIO_MANIFEST = {
  id: VOICE_STUDIO_MOD_ID,
  name: 'Voice Studio',
  version: '0.1.0',
  description: 'Multi-character AI voice narration and audiobook generation',
  author: { name: 'Nimi', url: 'https://nimi.xyz' },
  license: 'MIT',
  entry: './dist/mods/voice-studio/index.js',
  hash: 'default-voice-studio',
  nimi: {
    minVersion: '1.0.0',
    maxVersion: '2.x',
  },
  capabilities: [...VOICE_STUDIO_PERMISSIONS],
  dependencies: [],
  hooks: {
    uiExtensions: [
      {
        slot: VOICE_STUDIO_NAV_SLOT,
        componentRef: 'voice-studio:navigation-item',
      },
      {
        slot: VOICE_STUDIO_ROUTE_SLOT,
        componentRef: 'voice-studio:route-page',
      },
    ],
  },
  ai: {
    consume: ['chat', 'speech'],
    dependencies: {
      required: [
        {
          dependencyId: 'voice-studio/chat-qwen2.5-7b',
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
          dependencyId: 'voice-studio/tts-token-node',
          kind: 'node',
          capability: 'speech',
          nodeId: 'speech.synthesize.token-api',
          title: 'Token API TTS node',
        },
      ],
      preferred: {
        chat: 'voice-studio/chat-qwen2.5-7b',
      },
    },
  },
} as const;
