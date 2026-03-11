import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveStageConversationSlice } from '../src/components/layout/stage-dialogue-card.tsx';
import type { ChatMessage } from '../src/types.ts';

function createTextMessage(input: {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  turnId?: string;
}): ChatMessage {
  return {
    id: input.id,
    role: input.role,
    kind: 'text',
    content: input.content,
    timestamp: new Date('2026-03-10T10:00:00.000Z'),
    ...(input.turnId ? { meta: { turnId: input.turnId, beatIndex: 0 } } : {}),
  };
}

test('stage dialogue slice groups the latest assistant turn and the nearest preceding user message', () => {
  const firstUser = createTextMessage({
    id: 'user-1',
    role: 'user',
    content: '前一轮',
  });
  const firstAssistant = createTextMessage({
    id: 'assistant-1',
    role: 'assistant',
    content: '前一轮回复',
    turnId: 'turn-a',
  });
  const latestUser = createTextMessage({
    id: 'user-2',
    role: 'user',
    content: '这一轮我想继续聊',
  });
  const latestAssistantBeat1 = createTextMessage({
    id: 'assistant-2',
    role: 'assistant',
    content: '当然。',
    turnId: 'turn-b',
  });
  const latestAssistantBeat2 = createTextMessage({
    id: 'assistant-3',
    role: 'assistant',
    content: '我还在这儿。',
    turnId: 'turn-b',
  });

  const slice = resolveStageConversationSlice({
    messages: [
      firstUser,
      firstAssistant,
      latestUser,
      latestAssistantBeat1,
      latestAssistantBeat2,
    ],
    sendPhase: 'idle',
  });

  assert.equal(slice.pendingFirstBeat, false);
  assert.equal(slice.userMessage?.id, 'user-2');
  assert.deepEqual(slice.assistantMessages.map((message) => message.id), ['assistant-2', 'assistant-3']);
});

test('stage dialogue slice prefers the latest user message while first beat is still pending', () => {
  const previousAssistant = createTextMessage({
    id: 'assistant-old',
    role: 'assistant',
    content: '上一轮回复',
    turnId: 'turn-old',
  });
  const latestUser = createTextMessage({
    id: 'user-pending',
    role: 'user',
    content: '你还在吗？',
  });

  const slice = resolveStageConversationSlice({
    messages: [
      previousAssistant,
      latestUser,
    ],
    sendPhase: 'awaiting-first-beat',
  });

  assert.equal(slice.pendingFirstBeat, true);
  assert.equal(slice.userMessage?.id, 'user-pending');
  assert.deepEqual(slice.assistantMessages, []);
});
