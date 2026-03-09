import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractCreateAgentId,
  extractScopeKeyFromWorldAccess,
  parseOasisWorld,
} from '../src/realm-contract.js';

test('mint-you realm contract helpers accept current world and agent shapes only', () => {
  assert.equal(
    extractScopeKeyFromWorldAccess({
      userId: 'user-1',
      hasActiveAccess: true,
      canCreateWorld: true,
      canMaintainWorld: false,
      records: [],
    }),
    'user-1',
  );

  assert.deepEqual(
    parseOasisWorld({
      id: 'world-oasis',
      name: 'OASIS',
      status: 'ACTIVE',
    }),
    {
      id: 'world-oasis',
      name: 'OASIS',
    },
  );

  assert.equal(
    extractCreateAgentId({
      id: 'agent-1',
      state: 'INCUBATING',
      user: { id: 'account-1' },
      dna: {},
    }),
    'agent-1',
  );
});

test('mint-you realm contract helpers fail closed on invalid payloads', () => {
  assert.equal(extractScopeKeyFromWorldAccess({ items: [] }), '');
  assert.equal(parseOasisWorld({ worldId: 'legacy-oasis' }), null);
  assert.equal(extractCreateAgentId({ agentId: 'legacy-agent' }), '');
});
