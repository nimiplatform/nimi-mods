import test from 'node:test';
import assert from 'node:assert/strict';
import { worldStudioMessage } from '../src/i18n/messages.ts';

test('worldStudioMessage falls back to interpolated copy when i18n is unavailable', () => {
  assert.equal(
    worldStudioMessage(
      'notice.synthesizeCompletedMissingDna',
      'Synthesize completed, but missing DNA for: {{characters}}',
      { characters: '汪淼' },
    ),
    'Synthesize completed, but missing DNA for: 汪淼',
  );
});
