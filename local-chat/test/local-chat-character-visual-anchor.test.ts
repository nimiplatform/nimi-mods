import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCharacterVisualAnchor } from '../src/hooks/turn-send/character-visual-anchor.ts';
import type { LocalChatTarget } from '../src/data/types.ts';

function createTarget(): LocalChatTarget {
  return {
    id: 'agent.local-chat.anchor',
    handle: '~anchor_bot',
    displayName: 'Anchor Bot',
    avatarUrl: null,
    bio: 'Visual anchor test target.',
    friendsSince: null,
    isAgent: true,
    worldId: 'world.anchor',
    worldResolvedBy: 'profile',
    agentMetadata: {},
    agentProfile: {
      referenceImageUrl: 'https://example.com/agent-profile-reference.png',
      dna: {
        appearance: {
          summary: 'silver hair, calm eyes',
        },
      },
    },
    world: null,
    worldview: null,
    payload: {},
  };
}

test('buildCharacterVisualAnchor reads reference image from agent profile', () => {
  const anchor = buildCharacterVisualAnchor(createTarget());
  assert.equal(anchor.referenceImageUrl, 'https://example.com/agent-profile-reference.png');
});
