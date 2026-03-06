import assert from 'node:assert/strict';
import test from 'node:test';

import { buildVoiceOptionItems } from '../src/components/sidebar/voice-panel.js';

test('local-chat voice dropdown is providerless and keyed by voice id', () => {
  const options = buildVoiceOptionItems([
    { id: 'Cherry', name: 'Cherry' },
    { id: 'Serena', name: 'Serena' },
  ]);

  assert.deepEqual(options.map((item) => item.key), [
    'voice-option-Cherry',
    'voice-option-Serena',
  ]);
  assert.deepEqual(options.map((item) => item.value), ['Cherry', 'Serena']);
  assert.deepEqual(options.map((item) => item.label), ['Cherry', 'Serena']);
});
