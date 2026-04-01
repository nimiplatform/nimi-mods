import {
  AGENT_CAPTURE_CAPABILITIES,
  AGENT_CAPTURE_DATA_API_CREATOR_AGENTS_GET,
  AGENT_CAPTURE_DATA_API_CREATOR_AGENTS_LIST,
  AGENT_CAPTURE_HANDOFF_CHANNEL,
  AGENT_CAPTURE_MOD_ID,
  AGENT_CAPTURE_NAV_SLOT,
  AGENT_CAPTURE_ROUTE_SLOT,
} from './contracts.js';

export const AGENT_CAPTURE_MANIFEST = {
  id: AGENT_CAPTURE_MOD_ID,
  name: 'Agent-Capture',
  version: '1.0.0',
  description: 'Role-image capture workspace with text-led guidance, optional reference image, and existing agent context.',
  iconAsset: './assets/icon.svg',
  author: { name: 'Nimi', url: 'https://nimi.xyz' },
  license: 'MIT',
  entry: './dist/mods/agent-capture/index.js',
  styles: ['./dist/mods/agent-capture/index.css'],
  hash: 'default-agent-capture',
  nimi: {
    minVersion: '1.0.0',
    maxVersion: '2.x',
  },
  capabilities: [...AGENT_CAPTURE_CAPABILITIES],
  dependencies: [],
  hooks: {
    dataApis: [
      {
        name: AGENT_CAPTURE_DATA_API_CREATOR_AGENTS_LIST,
        description: 'List selectable existing agents through the host data query surface.',
      },
      {
        name: AGENT_CAPTURE_DATA_API_CREATOR_AGENTS_GET,
        description: 'Resolve one selected existing agent as auxiliary role context.',
      },
    ],
    uiExtensions: [
      {
        slot: AGENT_CAPTURE_NAV_SLOT,
        componentRef: 'agent-capture:navigation-item',
      },
      {
        slot: AGENT_CAPTURE_ROUTE_SLOT,
        componentRef: 'agent-capture:route-page',
      },
    ],
  },
  ai: {
    consume: ['chat', 'image'],
    profiles: [
      {
        id: 'agent-capture-default',
        title: 'Default capture stack',
        description: 'Balanced role-capture stack with local chat guidance and image generation.',
        recommended: true,
        consumeCapabilities: ['chat', 'image'],
        entries: [
          {
            entryId: 'agent-capture/chat-qwen2.5-7b',
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
            entryId: 'agent-capture/image-z-image-turbo',
            kind: 'asset',
            capability: 'image',
            assetId: 'local/z_image_turbo',
            assetKind: 'image',
            repo: 'jayn7/Z-Image-Turbo-GGUF',
            engine: 'media',
            title: 'Z-Image Turbo (GGUF)',
            required: true,
            preferred: true,
          },
          {
            entryId: 'agent-capture/image-z-image-ae',
            kind: 'asset',
            capability: 'image',
            assetId: 'local/z_image_ae',
            assetKind: 'vae',
            engineSlot: 'vae_path',
            templateId: 'verified.asset.z_image.vae',
            engine: 'media',
            title: 'Z-Image AE VAE',
            required: true,
            preferred: true,
          },
          {
            entryId: 'agent-capture/image-qwen3-4b-text-encoder',
            kind: 'asset',
            capability: 'image',
            assetId: 'local/qwen3_4b',
            assetKind: 'chat',
            engineSlot: 'llm_path',
            templateId: 'verified.asset.z_image.qwen3_4b',
            engine: 'media',
            title: 'Qwen3 4B Text Encoder',
            required: true,
            preferred: true,
          },
        ],
      },
    ],
  },
  interMod: {
    requests: [
      {
        channel: AGENT_CAPTURE_HANDOFF_CHANNEL,
        description: 'Explicitly hand off the current AgentDraft to Forge when available.',
      },
    ],
  },
} as const;
