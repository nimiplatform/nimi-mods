import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_LOCAL_CHAT_SETTINGS,
  mergeLocalChatSettings,
  resolveLocalChatVoiceEnabled,
} from '../src/default-settings-store.ts';

test('voice availability is disabled only when trigger is off and voice session mode is off', () => {
  assert.equal(resolveLocalChatVoiceEnabled({
    voiceAutonomy: 'off',
    voiceConversationMode: 'off',
  }), false);
});

test('voice availability is enabled when trigger policy is explicit-only or natural', () => {
  assert.equal(resolveLocalChatVoiceEnabled({
    voiceAutonomy: 'explicit-only',
    voiceConversationMode: 'off',
  }), true);
  assert.equal(resolveLocalChatVoiceEnabled({
    voiceAutonomy: 'natural',
    voiceConversationMode: 'off',
  }), true);
});

test('voice session mode can force voice availability even when trigger policy is off', () => {
  assert.equal(resolveLocalChatVoiceEnabled({
    voiceAutonomy: 'off',
    voiceConversationMode: 'on',
  }), true);
});

test('merged default settings derive enableVoice from persisted product settings', () => {
  const mergedOff = mergeLocalChatSettings({
    ...DEFAULT_LOCAL_CHAT_SETTINGS,
    product: {
      ...DEFAULT_LOCAL_CHAT_SETTINGS.product,
      voiceAutonomy: 'off',
      voiceConversationMode: 'off',
    },
  });
  const mergedOn = mergeLocalChatSettings({
    ...DEFAULT_LOCAL_CHAT_SETTINGS,
    product: {
      ...DEFAULT_LOCAL_CHAT_SETTINGS.product,
      voiceAutonomy: 'off',
      voiceConversationMode: 'on',
    },
  });

  assert.equal(mergedOff.enableVoice, false);
  assert.equal(mergedOn.enableVoice, true);
});
