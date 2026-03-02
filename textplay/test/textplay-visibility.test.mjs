import test from 'node:test';
import assert from 'node:assert/strict';
import { filterTextplayVisibility } from '../src/pipeline/filter-visibility.ts';
import { TEXTPLAY_REASON } from '../src/contracts.ts';

function createBaseNormalized(events) {
  return {
    storyId: 'story-1',
    worldId: 'world-1',
    agentId: 'agent-1',
    turnId: 'turn-1',
    runId: 'run-1',
    traceId: 'trace-1',
    triggerSource: 'UserTurn',
    playerId: 'player-1',
    userMessage: 'go north',
    systemPayload: null,
    sceneSummary: 'A canyon gate with storm clouds.',
    agentSummary: 'A sentinel watches the passage.',
    worldStyleSummary: 'Grounded fantasy.',
    events,
    metrics: {},
  };
}

test('npc internal event is filtered out', () => {
  const normalized = createBaseNormalized([
    {
      eventId: 'evt-internal-npc',
      visibility: 'internal',
      content: 'NPC hides a knife in sleeve.',
      thinker: 'npc-1',
      decider: '',
      experiencer: '',
      owner: '',
      sourceEventIds: ['spine-001'],
    },
    {
      eventId: 'evt-public',
      visibility: 'public',
      content: 'Wind scatters ash across the bridge.',
      thinker: '',
      decider: '',
      experiencer: '',
      owner: '',
      sourceEventIds: ['spine-002'],
    },
  ]);

  const result = filterTextplayVisibility({ normalized });
  assert.equal(result.visibleEvents.length, 1);
  assert.equal(result.visibleEvents[0].eventId, 'evt-public');
});

test('player internal event is retained', () => {
  const normalized = createBaseNormalized([
    {
      eventId: 'evt-internal-player',
      visibility: 'internal',
      content: 'Player doubts the old map.',
      thinker: 'player-1',
      decider: '',
      experiencer: '',
      owner: '',
      sourceEventIds: ['spine-003'],
    },
  ]);

  const result = filterTextplayVisibility({ normalized });
  assert.equal(result.visibleEvents.length, 1);
  assert.equal(result.visibleEvents[0].eventId, 'evt-internal-player');
});

test('invalid visibility fails close', () => {
  const normalized = createBaseNormalized([
    {
      eventId: 'evt-invalid',
      visibility: 'secret',
      content: 'invalid visibility channel',
      thinker: '',
      decider: '',
      experiencer: '',
      owner: '',
      sourceEventIds: ['spine-004'],
    },
  ]);

  assert.throws(
    () => filterTextplayVisibility({ normalized }),
    (error) => {
      assert.equal(error.reasonCode, TEXTPLAY_REASON.POV_VIOLATION_DETECTED);
      return true;
    },
  );
});
