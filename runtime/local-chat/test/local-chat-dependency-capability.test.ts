import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldIncludeDependencyRepairAction } from '../src/hooks/controller/use-local-chat-page-actions.js';

test('dependency repair action gating uses runtime canonical capability tokens', () => {
  assert.equal(shouldIncludeDependencyRepairAction({
    isLocalSnapshotFailure: false,
    isVoiceEnabled: false,
    capability: 'text.generate',
  }), true);

  assert.equal(shouldIncludeDependencyRepairAction({
    isLocalSnapshotFailure: false,
    isVoiceEnabled: false,
    capability: 'audio.synthesize',
  }), false);

  assert.equal(shouldIncludeDependencyRepairAction({
    isLocalSnapshotFailure: false,
    isVoiceEnabled: false,
    capability: 'audio.transcribe',
  }), false);

  assert.equal(shouldIncludeDependencyRepairAction({
    isLocalSnapshotFailure: false,
    isVoiceEnabled: true,
    capability: 'audio.synthesize',
  }), true);

  assert.equal(shouldIncludeDependencyRepairAction({
    isLocalSnapshotFailure: true,
    isVoiceEnabled: true,
    capability: 'text.generate',
  }), false);
});
