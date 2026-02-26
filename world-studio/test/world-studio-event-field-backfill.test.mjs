import test from 'node:test';
import assert from 'node:assert/strict';
import { backfillChunkExtractionEventFields } from '../mods/world-studio/src/engine/heuristic/event-field-backfill.ts';

function makeEvidence(excerpt) {
  return [{
    segmentId: 'seg-1',
    offsetStart: 0,
    offsetEnd: excerpt.length,
    excerpt,
    confidence: 0.8,
    sourceType: 'chunk',
  }];
}

test('event field backfill repairs parent/dependencies and fills refs from verifiable source matches', () => {
  const sourceText = [
    '韩立在墨大宗参加宗门试炼，表现出色。',
    '翌日叔叔带韩立前往彩霞山，准备后续修行。',
  ].join('\n');
  const extraction = {
    worldSetting: '修仙宗门世界',
    timeline: [{ id: 't-1', label: '翌日' }],
    locations: [{ id: 'loc-1', name: '墨大宗' }, { id: 'loc-2', name: '彩霞山' }],
    characters: [{ id: 'char-1', name: '韩立' }, { id: 'char-2', name: '叔叔' }],
    events: {
      primary: [{
        id: 'p-1',
        level: 'PRIMARY',
        parentEventId: null,
        title: '宗门试炼',
        summary: '韩立在墨大宗参加宗门试炼',
        cause: '',
        process: '',
        result: '',
        timeRef: '',
        locationRefs: [],
        characterRefs: [],
        dependsOnEventIds: [],
        evidenceRefs: makeEvidence('韩立在墨大宗参加宗门试炼，表现出色。'),
        confidence: 0.7,
        needsEvidence: true,
      }],
      secondary: [{
        id: 's-1',
        level: 'SECONDARY',
        parentEventId: 'missing-parent',
        title: '后续安排',
        summary: '翌日叔叔带韩立前往彩霞山',
        cause: '',
        process: '',
        result: '',
        timeRef: '',
        locationRefs: [],
        characterRefs: ['char-1'],
        dependsOnEventIds: ['missing-parent', 's-1', 'p-1'],
        evidenceRefs: [],
        confidence: 0.6,
        needsEvidence: false,
      }],
    },
    characterRelations: [],
  };

  const next = backfillChunkExtractionEventFields(extraction, sourceText);
  const primary = next.events.primary[0];
  const secondary = next.events.secondary[0];

  assert.equal(primary.needsEvidence, false);
  assert.equal(primary.characterRefs.includes('韩立'), true);
  assert.equal(primary.locationRefs.includes('墨大宗'), true);

  assert.equal(secondary.parentEventId, 'p-1');
  assert.deepEqual(secondary.dependsOnEventIds, ['p-1']);
  assert.equal(secondary.characterRefs.includes('韩立'), true);
  assert.equal(secondary.locationRefs.includes('彩霞山'), true);
  assert.equal(secondary.timeRef, '翌日');
});

test('event field backfill prunes dependency cycles and invalid IDs', () => {
  const extraction = {
    worldSetting: '',
    timeline: [],
    locations: [],
    characters: [],
    events: {
      primary: [
        {
          id: 'p-1',
          level: 'PRIMARY',
          parentEventId: null,
          title: 'A',
          summary: 'A',
          cause: '',
          process: '',
          result: '',
          timeRef: '',
          locationRefs: [],
          characterRefs: [],
          dependsOnEventIds: ['p-2', 'ghost'],
          evidenceRefs: makeEvidence('A'),
          confidence: 0.7,
          needsEvidence: false,
        },
        {
          id: 'p-2',
          level: 'PRIMARY',
          parentEventId: null,
          title: 'B',
          summary: 'B',
          cause: '',
          process: '',
          result: '',
          timeRef: '',
          locationRefs: [],
          characterRefs: [],
          dependsOnEventIds: ['p-1'],
          evidenceRefs: makeEvidence('B'),
          confidence: 0.7,
          needsEvidence: false,
        },
      ],
      secondary: [],
    },
    characterRelations: [],
  };

  const next = backfillChunkExtractionEventFields(extraction, 'A\nB');
  const depP1 = next.events.primary.find((event) => event.id === 'p-1')?.dependsOnEventIds || [];
  const depP2 = next.events.primary.find((event) => event.id === 'p-2')?.dependsOnEventIds || [];

  assert.equal(depP1.includes('ghost'), false);
  assert.equal(depP1.includes('p-2') && depP2.includes('p-1'), false);
});

test('event field backfill does not invent refs when source has no exact match', () => {
  const extraction = {
    worldSetting: '',
    timeline: [{ id: 't-1', label: '第三日' }],
    locations: [{ id: 'loc-1', name: '青石镇' }],
    characters: [{ id: 'char-1', name: '韩立' }],
    events: {
      primary: [{
        id: 'p-1',
        level: 'PRIMARY',
        parentEventId: null,
        title: '神秘异动',
        summary: '现场出现异动',
        cause: '',
        process: '',
        result: '',
        timeRef: '',
        locationRefs: [],
        characterRefs: [],
        dependsOnEventIds: [],
        evidenceRefs: [],
        confidence: 0.6,
        needsEvidence: true,
      }],
      secondary: [],
    },
    characterRelations: [],
  };

  const next = backfillChunkExtractionEventFields(
    extraction,
    '天空突然震动，众人惊慌失措。',
  );
  const primary = next.events.primary[0];

  assert.deepEqual(primary.characterRefs, []);
  assert.deepEqual(primary.locationRefs, []);
  assert.equal(primary.timeRef, '');
});
