import test from 'node:test';
import assert from 'node:assert/strict';

import { resolvePresenceStatus } from '../src/components/layout/local-chat-presence-status.ts';
import type { ChatMessage } from '../src/types.ts';

function createTextMessage(input: {
  id: string;
  role: 'user' | 'assistant';
  kind?: ChatMessage['kind'];
  content?: string;
}): ChatMessage {
  return {
    id: input.id,
    role: input.role,
    kind: input.kind || 'text',
    content: input.content || '',
    timestamp: new Date('2026-03-11T12:00:00.000Z'),
  };
}

function t(key: string): string {
  return key;
}

test('resolvePresenceStatus prefers speaking when voice playback is active', () => {
  const status = resolvePresenceStatus({
    loadingTargetDetail: false,
    hasInputText: false,
    isSending: false,
    sendPhase: 'idle',
    messages: [
      createTextMessage({ id: 'assistant-1', role: 'assistant', kind: 'image-pending' }),
    ],
    playingVoiceMessageId: 'assistant-voice',
    t,
  });

  assert.deepEqual(status, {
    label: 'Header.presenceSpeaking',
    busy: true,
  });
});

test('resolvePresenceStatus reports painting when the latest assistant message is pending image media', () => {
  const status = resolvePresenceStatus({
    loadingTargetDetail: false,
    hasInputText: false,
    isSending: true,
    sendPhase: 'idle',
    messages: [
      createTextMessage({ id: 'assistant-1', role: 'assistant', kind: 'image-pending' }),
    ],
    playingVoiceMessageId: null,
    t,
  });

  assert.deepEqual(status, {
    label: 'Header.presencePainting',
    busy: true,
  });
});

test('resolvePresenceStatus reports thinking while first beat is pending', () => {
  const status = resolvePresenceStatus({
    loadingTargetDetail: false,
    hasInputText: false,
    isSending: true,
    sendPhase: 'awaiting-first-beat',
    messages: [
      createTextMessage({ id: 'user-1', role: 'user', content: '你好' }),
    ],
    playingVoiceMessageId: null,
    t,
  });

  assert.deepEqual(status, {
    label: 'Header.presenceThinking',
    busy: true,
  });
});

test('resolvePresenceStatus reports listening when input already has text', () => {
  const status = resolvePresenceStatus({
    loadingTargetDetail: false,
    hasInputText: true,
    isSending: false,
    sendPhase: 'idle',
    messages: [],
    playingVoiceMessageId: null,
    t,
  });

  assert.deepEqual(status, {
    label: 'Header.presenceListening',
    busy: false,
  });
});
