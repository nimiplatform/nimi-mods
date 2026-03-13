import test from 'node:test';
import assert from 'node:assert/strict';
import { enrichNarrativeCoreOutputCausality } from '../src/pipeline/causal-enrichment.ts';

function createSnapshot(overrides = {}) {
  return {
    place: 'Iron Docks',
    worldviewRules: [],
    sceneMaterial: [],
    availableActors: ['agent-1', 'agent-2'],
    narrativeStyle: {},
    characterRelations: [],
    phase: 'rising',
    objective: 'Hold the line',
    tensionTarget: 0.7,
    openThreads: ['Who sabotaged the inspection line?'],
    startupPolicy: {},
    futurePressure: ['The cordon is tightening.'],
    contextCoverage: {
      canon: true,
      story: true,
      subject: true,
      relation: true,
      scene: true,
      warnings: [],
    },
    narrativeContextScopes: {
      CANON: {},
      STORY: {},
      SUBJECT: {},
      RELATION: {},
    },
    ...overrides,
  };
}

test('causal enrichment preserves model-provided source event ids', () => {
  const result = enrichNarrativeCoreOutputCausality({
    triggerSource: 'UserTurn',
    snapshot: createSnapshot(),
    recentSpineEvents: [],
    coreOutput: {
      spineEvents: [{
        id: 'evt-2',
        type: 'observation',
        visibility: 'public',
        payload: { summary: 'Lanterns gutter in the rain.' },
        sourceEventIds: ['evt-1', 'evt-1', 'evt-2'],
      }],
      stateChanges: {},
      metrics: {},
    },
  });

  assert.deepEqual(result.spineEvents[0].sourceEventIds, ['evt-1']);
});

test('causal enrichment links to recent related events when model omits source ids', () => {
  const result = enrichNarrativeCoreOutputCausality({
    triggerSource: 'UserTurn',
    snapshot: createSnapshot(),
    recentSpineEvents: [
      {
        id: 'evt-anchor',
        type: 'action',
        visibility: 'public',
        owner: 'agent-1',
        payload: {
          sceneId: 'scene-docks',
          summary: 'Han Li braces the signal mast while the inspection line buckles.',
          participants: ['agent-1', 'user-1'],
        },
      },
    ],
    coreOutput: {
      spineEvents: [{
        id: 'evt-new',
        type: 'observation',
        visibility: 'public',
        owner: 'agent-1',
        payload: {
          sceneId: 'scene-docks',
          summary: 'The signal mast groans as Han Li scans the collapsing inspection line.',
          participants: ['agent-1', 'user-1'],
        },
      }],
      stateChanges: {},
      metrics: {},
    },
  });

  assert.deepEqual(result.spineEvents[0].sourceEventIds, ['evt-anchor']);
});

test('causal enrichment leaves opening-like turns unlinked when no history is available', () => {
  const result = enrichNarrativeCoreOutputCausality({
    triggerSource: 'SystemEvent',
    snapshot: createSnapshot(),
    recentSpineEvents: [],
    coreOutput: {
      spineEvents: [{
        id: 'evt-opening',
        type: 'observation',
        visibility: 'public',
        payload: { summary: 'Storm clouds gather above the harbor.' },
      }],
      stateChanges: {},
      metrics: {},
    },
  });

  assert.equal('sourceEventIds' in result.spineEvents[0], false);
});
