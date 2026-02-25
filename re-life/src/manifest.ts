import {
  RELIFE_MOD_ID,
  RELIFE_NAV_SLOT,
  RELIFE_PERMISSIONS,
  RELIFE_ROUTE_SLOT,
} from './contracts.js';

export const RELIFE_MANIFEST = {
  id: RELIFE_MOD_ID,
  name: 'Re:Life',
  version: '1.0.0',
  description: 'Decision retrospect and parallel timeline simulation workspace',
  icon: 're-life',
  author: { name: 'Nimi', url: 'https://nimi.xyz' },
  license: 'MIT',
  entry: './dist/mods/re-life/index.js',
  hash: 'default-re-life',
  nimi: {
    minVersion: '1.0.0',
    maxVersion: '2.x',
  },
  capabilities: [...RELIFE_PERMISSIONS],
  dependencies: [],
  hooks: {
    uiExtensions: [
      {
        slot: RELIFE_NAV_SLOT,
        componentRef: 're-life:navigation-item',
      },
      {
        slot: RELIFE_ROUTE_SLOT,
        componentRef: 're-life:route-page',
      },
    ],
  },
  ai: {
    consume: ['chat'],
    dependencies: {
      required: [
        {
          dependencyId: 'relife/chat-default',
          kind: 'model',
          capability: 'chat',
          engine: 'openai-compatible',
          title: 'Default Chat Model (runtime-resolved)',
        },
      ],
      preferred: {
        chat: 'relife/chat-default',
      },
    },
  },
} as const;
