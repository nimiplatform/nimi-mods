import {
  LOCAL_CHAT_DATA_API_CHAT_TARGET_DETAIL,
  LOCAL_CHAT_DATA_API_CHAT_TARGETS_LIST,
  LOCAL_CHAT_DATA_API_SESSIONS_DELETE,
  LOCAL_CHAT_DATA_API_SESSIONS_GET,
  LOCAL_CHAT_DATA_API_SESSIONS_LIST,
  LOCAL_CHAT_DATA_API_SESSIONS_UPSERT,
  LOCAL_CHAT_MOD_ID,
  LOCAL_CHAT_NAV_SLOT,
  LOCAL_CHAT_CAPABILITIES,
  LOCAL_CHAT_ROUTE_SLOT,
  LOCAL_CHAT_UI_SLOT,
} from './contracts.js';

/**
 * local-chat mod manifest.
 *
 * This runtime mod exposes local LLM provider execution through the current
 * zero-bundle host contract. It demonstrates how a mod declares capabilities,
 * turn-hooks, and inter-mod channels without relying on desktop-private code.
 */
export const LOCAL_CHAT_MANIFEST = {
  id: LOCAL_CHAT_MOD_ID,
  name: 'Local Chat',
  version: '1.0.0',
  description: 'Third-party style local LLM execution mod for private chats',
  icon: 'local-chat',
  iconAsset: './assets/icon.svg',
  author: { name: 'Nimi', url: 'https://nimi.xyz' },
  license: 'MIT',
  entry: './dist/mods/local-chat/index.js',
  styles: ['./dist/mods/local-chat/index.css'],
  hash: 'default-local-chat',
  nimi: {
    minVersion: '1.0.0',
    maxVersion: '2.x',
  },
  capabilities: [...LOCAL_CHAT_CAPABILITIES],
  dependencies: [],
  hooks: {
    dataApis: [
      {
        name: LOCAL_CHAT_DATA_API_CHAT_TARGETS_LIST,
        description: 'Read lightweight Agent friend targets for local chat selector',
      },
      {
        name: LOCAL_CHAT_DATA_API_CHAT_TARGET_DETAIL,
        description: 'Resolve selected chat target detail (agent profile + world + worldview) with lazy cache',
      },
      {
        name: LOCAL_CHAT_DATA_API_SESSIONS_LIST,
        description: 'List local-chat sessions for selected target',
      },
      {
        name: LOCAL_CHAT_DATA_API_SESSIONS_GET,
        description: 'Get one local-chat session by id',
      },
      {
        name: LOCAL_CHAT_DATA_API_SESSIONS_UPSERT,
        description: 'Create or update one local-chat session',
      },
      {
        name: LOCAL_CHAT_DATA_API_SESSIONS_DELETE,
        description: 'Delete one local-chat session by id',
      },
    ],
    uiExtensions: [
      {
        slot: LOCAL_CHAT_NAV_SLOT,
        componentRef: 'local-chat:navigation-item',
      },
      {
        slot: LOCAL_CHAT_ROUTE_SLOT,
        componentRef: 'local-chat:route-page',
      },
      {
        slot: LOCAL_CHAT_UI_SLOT,
        componentRef: 'local-chat:runtime-panel',
      },
    ],
  },
  ai: {
    consume: ['chat', 'image', 'video', 'tts', 'stt'],
    dependencies: {
      required: [
        {
          dependencyId: 'local-chat/chat-qwen2.5-7b',
          kind: 'model',
          capability: 'chat',
          modelId: 'qwen2.5-7b-instruct',
          repo: 'Qwen/Qwen2.5-7B-Instruct-GGUF',
          engine: 'openai-compatible',
          title: 'Qwen2.5 7B Instruct (default)',
        },
        {
          dependencyId: 'local-chat/image-z-image-turbo',
          kind: 'model',
          capability: 'image',
          modelId: 'z-image-turbo',
          repo: 'nimeka/z-image-turbo',
          engine: 'openai-compatible',
          title: 'Z-Image Turbo (default)',
        },
      ],
      optional: [
        {
          dependencyId: 'local-chat/video-generate-token-node',
          kind: 'node',
          capability: 'video',
          nodeId: 'video.generate.cloud',
          title: 'Optional video generation node',
        },
        {
          dependencyId: 'local-chat/stt-local-node',
          kind: 'node',
          capability: 'stt',
          nodeId: 'speech.stt.openai-compatible',
          title: 'Optional local STT node',
        },
      ],
      alternatives: [
        {
          alternativeId: 'local-chat-tts-qwen3',
          preferredDependencyId: 'local-chat/tts-qwen3-1.7b',
          options: [
            {
              dependencyId: 'local-chat/tts-qwen3-1.7b',
              kind: 'service',
              capability: 'tts',
              serviceId: 'qwen-tts-python',
              modelId: 'Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign',
              repo: 'Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign',
              engine: 'qwen-tts-python',
              title: 'Qwen3 TTS 1.7B (recommended)',
            },
            {
              dependencyId: 'local-chat/tts-qwen3-0.6b',
              kind: 'service',
              capability: 'tts',
              serviceId: 'qwen-tts-python',
              modelId: 'Qwen/Qwen3-TTS-12Hz-0.6B-VoiceDesign',
              repo: 'Qwen/Qwen3-TTS-12Hz-0.6B-VoiceDesign',
              engine: 'qwen-tts-python',
              title: 'Qwen3 TTS 0.6B',
            },
          ],
        },
      ],
      preferred: {
        chat: 'local-chat/chat-qwen2.5-7b',
        image: 'local-chat/image-z-image-turbo',
        tts: 'local-chat/tts-qwen3-1.7b',
      },
    },
  },
} as const;
