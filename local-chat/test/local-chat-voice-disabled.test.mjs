import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveVoiceAutoplayDecision } from '../src/hooks/controller/use-local-chat-page-effects.js';
import { resolveAssistantSegmentKind } from '../src/hooks/turn-send/channel-policy.js';
import { resolveVoiceInputPreflightError } from '../src/hooks/use-speech-transcribe.js';
import { shouldLoadSpeechVoices } from '../src/hooks/use-local-chat-speech-settings.js';

test('voice disabled forces assistant delivery to text', () => {
  const kind = resolveAssistantSegmentKind({
    segment: {
      id: 'segment-1',
      content: '你好呀，今天过得怎么样？',
      delayMs: 0,
      channel: 'auto',
      intent: 'checkin',
    },
    settings: {
      enableVoice: false,
    },
  });

  assert.equal(kind, 'text');
});

test('voice disabled blocks speech input before recording starts', () => {
  const failure = resolveVoiceInputPreflightError({
    enableVoice: false,
    selectedTargetId: 'target-1',
    sttRouteSource: 'auto',
    localSttRouteAvailable: true,
  });

  assert.deepEqual(failure, {
    reasonCode: 'LOCAL_CHAT_STT_VOICE_DISABLED',
    detail: 'Voice input is disabled',
  });
});

test('voice disabled skips speech voice catalog loading', () => {
  assert.equal(shouldLoadSpeechVoices({
    enableVoice: false,
    model: 'gpt-4o-mini-tts',
  }), false);

  assert.equal(shouldLoadSpeechVoices({
    enableVoice: true,
    model: '',
  }), false);

  assert.equal(shouldLoadSpeechVoices({
    enableVoice: true,
    model: 'gpt-4o-mini-tts',
  }), true);
});

test('voice disabled blocks voice autoplay before playback starts', () => {
  assert.equal(resolveVoiceAutoplayDecision({
    enableVoice: false,
    autoPlayEnabled: true,
    playingVoiceMessageId: null,
  }), 'skip-voice-disabled');

  assert.equal(resolveVoiceAutoplayDecision({
    enableVoice: true,
    autoPlayEnabled: false,
    playingVoiceMessageId: null,
  }), 'skip-disabled');

  assert.equal(resolveVoiceAutoplayDecision({
    enableVoice: true,
    autoPlayEnabled: true,
    playingVoiceMessageId: 'voice-message-1',
  }), 'skip-playing');
});
