import {
  MINTYOU_MOD_ID,
  MINTYOU_NAV_SLOT,
  MINTYOU_ROUTE_SLOT,
  MINTYOU_DATA_API_AGENTS_CREATE,
  MINTYOU_DATA_API_WORLDS_MINE,
  MINTYOU_PERMISSIONS,
} from './contracts.js';

export const MINTYOU_MANIFEST = {
  id: MINTYOU_MOD_ID,
  name: 'Mint-You',
  version: '1.0.0',
  description: 'Personality-driven social persona agent creator with behavioral scenario profiling',
  icon: 'mint-you',
  author: { name: 'Nimi', url: 'https://nimi.xyz' },
  license: 'MIT',
  entry: './dist/mods/mint-you/index.js',
  hash: 'default-mint-you',
  nimi: {
    minVersion: '1.0.0',
    maxVersion: '2.x',
  },
  capabilities: [...MINTYOU_PERMISSIONS],
  dependencies: [],
  hooks: {
    dataApis: [
      {
        name: MINTYOU_DATA_API_AGENTS_CREATE,
        description: 'Create agent via creator API with pre-built DNA',
      },
      {
        name: MINTYOU_DATA_API_WORLDS_MINE,
        description: 'Query worlds owned by current user for world selection',
      },
    ],
    uiExtensions: [
      {
        slot: MINTYOU_NAV_SLOT,
        componentRef: 'mint-you:navigation-item',
      },
      {
        slot: MINTYOU_ROUTE_SLOT,
        componentRef: 'mint-you:route-page',
      },
    ],
  },
  ai: {
    consume: ['chat'],
  },
} as const;
