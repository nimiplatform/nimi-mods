import { KB_CAPABILITIES, KB_MOD_ID, KB_NAV_SLOT, KB_ROUTE_SLOT } from './contracts.js';

export const KB_MANIFEST = {
  id: KB_MOD_ID,
  name: 'Knowledge Base',
  version: '1.0.0',
  description:
    'Private local knowledge base with document import, semantic search, and RAG-powered Q&A',
  author: { name: 'Nimi', url: 'https://nimi.ai' },
  license: 'MIT',
  iconAsset: './assets/icon.svg',
  entry: './dist/mods/knowledge-base/index.js',
  styles: ['./dist/mods/knowledge-base/index.css'],
  hash: 'default-knowledge-base',
  nimi: {
    minVersion: '1.0.0',
    maxVersion: '2.x',
  },
  capabilities: [...KB_CAPABILITIES],
  dependencies: [],
  hooks: {
    uiExtensions: [
      {
        slot: KB_NAV_SLOT,
        componentRef: 'knowledge-base:navigation-item',
      },
      {
        slot: KB_ROUTE_SLOT,
        componentRef: 'knowledge-base:route-page',
      },
    ],
  },
  ai: {
    consume: ['chat', 'embedding'],
    profiles: [
      {
        id: 'knowledge-base-llama',
        title: 'Default RAG stack',
        description: 'Qwen2.5 chat with llama embeddings.',
        recommended: true,
        consumeCapabilities: ['chat', 'embedding'],
        entries: [
          {
            entryId: 'knowledge-base/chat-qwen2.5-7b',
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
            entryId: 'knowledge-base/embedding-llama',
            kind: 'node',
            capability: 'embedding',
            nodeId: 'embedding.generate.llama',
            title: 'Local embedding node (llama)',
            engine: 'llama',
            required: true,
            preferred: true,
          },
        ],
      },
    ],
  },
} as const;
