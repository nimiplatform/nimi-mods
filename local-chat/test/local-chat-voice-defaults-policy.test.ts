import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldAutoPrimeVoiceDefaults } from '../src/hooks/controller/voice-defaults-policy.ts';

test('voice defaults auto-prime only for untouched fresh settings', () => {
  assert.equal(shouldAutoPrimeVoiceDefaults({
    alreadyPrimed: false,
    rawSettings: {},
    productSettings: {
      enableVoice: false,
      voiceConversationMode: 'off',
    },
    ttsReady: true,
  }), true);
});

test('voice defaults auto-prime does not override stored explicit voice-off preference', () => {
  assert.equal(shouldAutoPrimeVoiceDefaults({
    alreadyPrimed: false,
    rawSettings: {
      product: {
        enableVoice: false,
        voiceConversationMode: 'off',
      },
    },
    productSettings: {
      enableVoice: false,
      voiceConversationMode: 'off',
    },
    ttsReady: true,
  }), false);
});

test('voice defaults auto-prime stays off when TTS is not ready', () => {
  assert.equal(shouldAutoPrimeVoiceDefaults({
    alreadyPrimed: false,
    rawSettings: {},
    productSettings: {
      enableVoice: false,
      voiceConversationMode: 'off',
    },
    ttsReady: false,
  }), false);
});
