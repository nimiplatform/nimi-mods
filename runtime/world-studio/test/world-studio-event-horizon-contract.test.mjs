import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizePrimaryEvidenceCoverage } from '../src/engine/primary-evidence.ts';
import { runSynthesizeDraft } from '../src/engine/synthesize.ts';
import { deriveNeedsEvidence } from '../src/services/event-horizon.ts';

function makeEvent(id, eventHorizon, evidenceRefs = []) {
  return {
    id,
    level: 'PRIMARY',
    eventHorizon,
    parentEventId: null,
    title: id,
    summary: `${id} summary`,
    cause: '',
    process: '',
    result: '',
    timeRef: id,
    locationRefs: [],
    characterRefs: [],
    dependsOnEventIds: [],
    evidenceRefs,
    confidence: 0.8,
    needsEvidence: false,
  };
}

test('primary evidence coverage ignores FUTURE primary events without evidence', () => {
  const summary = summarizePrimaryEvidenceCoverage([
    makeEvent('past-1', 'PAST', []),
    makeEvent('future-1', 'FUTURE', []),
    makeEvent('future-2', 'FUTURE', [
      { segmentId: 'seg-future-2', offsetStart: 0, offsetEnd: 5, excerpt: 'future', confidence: 0.7, sourceType: 'chunk' },
    ]),
  ]);

  assert.deepEqual(summary, {
    total: 1,
    withEvidence: 0,
    missing: 1,
    coverage: 0,
  });
});

test('future events can keep explicit needsEvidence without participating in evidence gate', () => {
  assert.equal(deriveNeedsEvidence({
    level: 'PRIMARY',
    eventHorizon: 'FUTURE',
    evidenceRefs: [],
    needsEvidence: true,
  }), true);

  assert.deepEqual(summarizePrimaryEvidenceCoverage([
    {
      ...makeEvent('future-explicit', 'FUTURE', []),
      needsEvidence: true,
    },
  ]), {
    total: 0,
    withEvidence: 0,
    missing: 0,
    coverage: 1,
  });
});

test('phase2 synthesize preserves eventHorizon and derives evidence requirements from it', async () => {
  const result = await runSynthesizeDraft({
    async generateText() {
      return {
        text: JSON.stringify({
          world: {
            name: 'World',
            description: 'Description',
          },
          worldview: {
            timeModel: { timeFlowRatio: 1, calendarSystem: {} },
            spaceTopology: {},
            causality: {},
            coreSystem: { rules: [] },
          },
          worldEvents: [
            makeEvent('future-1', 'FUTURE', []),
            makeEvent('past-1', 'PAST', []),
          ],
          futureHistoricalEvents: [],
          agentDrafts: [],
        }),
        promptTraceId: 'trace-event-horizon',
      };
    },
  }, {
    selectedStartTimeId: 'event:past-1',
    selectedCharacters: [],
    knowledgeGraph: {
      worldSetting: 'world',
      timeline: [{ id: 't-1', label: 'now' }],
      locations: [],
      characters: [],
      events: {
        primary: [
          makeEvent('seed-1', 'PAST', [
            { segmentId: 'seg-seed-1', offsetStart: 0, offsetEnd: 4, excerpt: 'seed', confidence: 0.8, sourceType: 'chunk' },
          ]),
        ],
        secondary: [],
      },
      characterRelations: [],
      futureHistoricalEvents: [],
    },
  });

  assert.equal(result.worldEvents[0].eventHorizon, 'FUTURE');
  assert.equal(result.worldEvents[0].needsEvidence, false);
  assert.equal(result.worldEvents[1].eventHorizon, 'PAST');
  assert.equal(result.worldEvents[1].needsEvidence, true);
});
