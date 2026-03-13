import test from 'node:test';
import assert from 'node:assert/strict';
import {
  exportStoryState,
  hydrateStoryState,
  resetNarrativeRepositoryForTests,
  resetStoryState,
  upsertNarrativeContext,
} from '../src/index.ts';
import {
  readNarrativeInitiativeStoryState,
  recordNarrativeInitiativeFired,
} from '../src/initiative/policy.ts';

test.beforeEach(() => {
  resetNarrativeRepositoryForTests();
});

test('story snapshot round-trips initiative runtime state', () => {
  const storyId = 'story_snapshot_roundtrip';
  upsertNarrativeContext(storyId, {
    CANON: {},
    STORY: { phase: 'rising' },
    SUBJECT: {},
    RELATION: {},
  });
  recordNarrativeInitiativeFired({
    storyId,
    nowMs: Date.parse('2026-03-13T03:00:00.000Z'),
    sceneFingerprint: 'iron-docks',
  });

  const snapshot = exportStoryState(storyId);
  assert.equal(snapshot.initiativeState.consecutive, 1);
  assert.equal(snapshot.initiativeState.lastSceneFingerprint, 'iron-docks');

  resetStoryState(storyId);
  assert.deepEqual(readNarrativeInitiativeStoryState(storyId), {
    lastFiredAt: null,
    consecutive: 0,
    lastSceneFingerprint: null,
  });

  hydrateStoryState(snapshot);
  assert.deepEqual(readNarrativeInitiativeStoryState(storyId), snapshot.initiativeState);
});
