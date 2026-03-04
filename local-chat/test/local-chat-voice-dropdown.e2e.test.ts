import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveVisibleSpeechVoices } from '../src/components/runtime-status-sidebar.js';
import { buildVoiceOptionItems } from '../src/components/sidebar/voice-panel.js';

test('local-chat voice dropdown keeps token-api voices unfiltered by provider', () => {
  const voices = resolveVisibleSpeechVoices({
    ttsRouteSource: 'token-api',
    selectedSpeechProviderId: 'other-provider',
    speechVoices: [
      { id: 'Cherry', providerId: 'dashscope', name: 'Cherry' },
      { id: 'Serena', providerId: 'dashscope', name: 'Serena' },
    ],
  });

  assert.equal(voices.length, 2);
  assert.equal(voices[0]?.id, 'Cherry');
  assert.equal(voices[1]?.id, 'Serena');
});

test('local-chat voice dropdown option model includes DashScope voices', () => {
  const options = buildVoiceOptionItems([
    { id: 'Cherry', providerId: 'dashscope', name: 'Cherry' },
    { id: 'Serena', providerId: 'dashscope', name: 'Serena' },
  ]);

  assert.deepEqual(options.map((item) => item.key), [
    'voice-option-dashscope-Cherry',
    'voice-option-dashscope-Serena',
  ]);
  assert.deepEqual(options.map((item) => item.value), ['Cherry', 'Serena']);
  assert.deepEqual(options.map((item) => item.label), ['Cherry', 'Serena']);
});
