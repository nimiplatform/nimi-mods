import test from 'node:test';
import assert from 'node:assert/strict';

import { compilePortableMemorySlots } from '../src/hooks/turn-send/portable-memory-compiler.ts';
import type { RelationMemorySlot } from '../src/state/ledger-types.ts';

function createSlot(overrides: Partial<RelationMemorySlot>): RelationMemorySlot {
  return {
    id: 'slot-1',
    targetId: 'target-1',
    viewerId: 'viewer-1',
    slotType: 'preference',
    key: '喜欢夜聊',
    value: '用户喜欢在深夜慢慢聊天。',
    confidence: 0.72,
    portability: 'portable',
    sensitivity: 'safe',
    userOverride: 'inherit',
    updatedAt: '2026-03-08T00:00:00.000Z',
    ...overrides,
  };
}

test('portable memory compiler fallback blocks explicit memory and keeps preference portable', async () => {
  const result = await compilePortableMemorySlots({
    aiClient: {
      generateObject: async () => {
        throw new Error('unavailable');
      },
    },
    relationMemorySlots: [
      createSlot({ id: 'slot-pref', slotType: 'preference' }),
      createSlot({
        id: 'slot-explicit',
        slotType: 'taboo',
        key: 'explicit detail',
        value: '用户描述了 nude fetish scene。',
      }),
    ],
    interactionSnapshot: null,
  });

  assert.deepEqual(
    result.map((slot) => ({ id: slot.id, portability: slot.portability, sensitivity: slot.sensitivity })),
    [
      { id: 'slot-pref', portability: 'portable', sensitivity: 'safe' },
      { id: 'slot-explicit', portability: 'blocked', sensitivity: 'intimate' },
    ],
  );
});

test('portable memory compiler applies model governance labels without changing user override', async () => {
  const result = await compilePortableMemorySlots({
    aiClient: {
      generateObject: async () => ({
        object: {
          slots: [
            { id: 'slot-promise', portability: 'local-only', sensitivity: 'personal' },
          ],
        },
      }),
    },
    relationMemorySlots: [
      createSlot({
        id: 'slot-promise',
        slotType: 'promise',
        key: '答应过下次继续',
        value: '答应过下次继续讲完这个故事。',
        userOverride: 'never-sync',
      }),
    ],
    interactionSnapshot: null,
  });

  assert.equal(result[0]?.portability, 'local-only');
  assert.equal(result[0]?.sensitivity, 'personal');
  assert.equal(result[0]?.userOverride, 'never-sync');
});
