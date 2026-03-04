import {
  KB_MOD_ID,
  KB_NAV_SLOT,
  KB_PERMISSIONS,
  KB_ROUTE_SLOT,
} from './contracts.js';

export const KB_MANIFEST = {
  id: KB_MOD_ID,
  name: 'Knowledge Base',
  version: '1.0.0',
  description: 'Private local knowledge base with document import, semantic search, and RAG-powered Q&A',
  author: { name: 'Nimi', url: 'https://nimi.xyz' },
  license: 'MIT',
  entry: './dist/mods/knowledge-base/index.js',
  hash: 'default-knowledge-base',
  nimi: {
    minVersion: '1.0.0',
    maxVersion: '2.x',
  },
  capabilities: [...KB_PERMISSIONS],
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
    dependencies: {
      required: [
        {
          dependencyId: 'knowledge-base/chat-qwen2.5-7b',
          kind: 'model',
          capability: 'chat',
          modelId: 'qwen2.5-7b-instruct',
          repo: 'Qwen/Qwen2.5-7B-Instruct-GGUF',
          engine: 'openai-compatible',
          title: 'Qwen2.5 7B Instruct (default)',
        },
      ],
      alternatives: [
        {
          alternativeId: 'knowledge-base-embedding-runtime',
          preferredDependencyId: 'knowledge-base/embedding-localai',
          options: [
            {
              dependencyId: 'knowledge-base/embedding-localai',
              kind: 'node',
              capability: 'embedding',
              nodeId: 'embedding.generate.localai',
              title: 'Local embedding node (LocalAI)',
            },
            {
              dependencyId: 'knowledge-base/embedding-nexa',
              kind: 'node',
              capability: 'embedding',
              nodeId: 'embedding.generate.nexa',
              title: 'Local embedding node (Nexa)',
            },
          ],
        },
      ],
      preferred: {
        chat: 'knowledge-base/chat-qwen2.5-7b',
        embedding: 'knowledge-base/embedding-localai',
      },
    },
  },
} as const;
