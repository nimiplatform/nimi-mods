import test from 'node:test';
import assert from 'node:assert/strict';
import { getPlayableEntryDetail, listPlayableEntries } from '../src/data/entry-catalog.ts';
import { TEXTPLAY_DATA_API_WORLD_EVENTS_LIST } from '../src/contracts.ts';

function createHookClient(rows) {
  return {
    data: {
      query: async ({ capability, query }) => {
        assert.equal(capability, TEXTPLAY_DATA_API_WORLD_EVENTS_LIST);
        assert.equal(query.worldId, 'world-1');
        return { items: rows };
      },
    },
  };
}

test('listPlayableEntries returns PRIMARY non-future entries sorted by timeline sequence', async () => {
  const rows = [
    {
      id: 'evt-secondary',
      worldId: 'world-1',
      title: 'Secondary Event',
      summary: 'Ignored because not primary.',
      level: 'SECONDARY',
      eventHorizon: 'PAST',
      timelineSeq: 2,
      updatedAt: '2026-03-02T10:00:00.000Z',
      characterRefs: ['agent-2'],
    },
    {
      id: 'evt-future',
      worldId: 'world-1',
      title: 'Future Event',
      summary: 'Ignored because future.',
      level: 'PRIMARY',
      eventHorizon: 'FUTURE',
      timelineSeq: 99,
      updatedAt: '2026-03-02T12:00:00.000Z',
      characterRefs: ['agent-3'],
    },
    {
      id: 'evt-late',
      worldId: 'world-1',
      title: 'Late Primary',
      summary: 'Playable primary entry.',
      cause: 'Storm front',
      process: 'Conflict lines tighten',
      level: 'PRIMARY',
      eventHorizon: 'ONGOING',
      timelineSeq: 8,
      updatedAt: '2026-03-02T14:00:00.000Z',
      characterRefs: ['agent-4', 'agent-5'],
    },
    {
      id: 'evt-early',
      worldId: 'world-1',
      title: 'Early Primary',
      summary: 'Another playable primary entry.',
      cause: 'Border unrest',
      process: 'Rumors spread through the city',
      level: 'PRIMARY',
      eventHorizon: 'PAST',
      timelineSeq: 3,
      updatedAt: '2026-03-02T09:00:00.000Z',
      characterRefs: ['agent-1'],
    },
  ];

  const entries = await listPlayableEntries({
    hookClient: createHookClient(rows),
    worldId: 'world-1',
  });

  assert.deepEqual(entries.map((item) => item.entryEventId), ['evt-early', 'evt-late']);
  assert.equal(entries[0].entryMode, 'PRE_EVENT');
  assert.equal(entries[0].eventHorizon, 'PAST');
  assert.equal(entries[0].playable, true);
  assert.deepEqual(entries[0].participants, ['agent-1']);
  assert.equal(entries[0].timelineSeq, 3);
  assert.match(entries[0].entryBackdrop, /Border unrest|Early Primary前的风暴正在积聚/);
  assert.match(entries[0].entryHook, /发生前的临界时刻切入/);
});

test('getPlayableEntryDetail returns full detail and hides future-only entry', async () => {
  const rows = [
    {
      id: 'evt-opening',
      worldId: 'world-1',
      title: 'Opening Clash',
      summary: 'The harbor is on the edge.',
      cause: 'Contraband dispute',
      process: 'Negotiation collapses',
      result: 'Security cordon tightens',
      timeRef: 'night-watch',
      locationRefs: ['scene-docks'],
      level: 'PRIMARY',
      eventHorizon: 'PAST',
      timelineSeq: 4,
      updatedAt: '2026-03-02T10:00:00.000Z',
      characterRefs: ['agent-1', 'agent-2'],
    },
    {
      id: 'evt-hidden-future',
      worldId: 'world-1',
      title: 'Hidden Future',
      summary: 'Not directly playable.',
      level: 'PRIMARY',
      eventHorizon: 'FUTURE',
      timelineSeq: 20,
      updatedAt: '2026-03-02T11:00:00.000Z',
      characterRefs: ['agent-3'],
    },
  ];

  const detail = await getPlayableEntryDetail({
    hookClient: createHookClient(rows),
    worldId: 'world-1',
    entryEventId: 'evt-opening',
  });
  const futureDetail = await getPlayableEntryDetail({
    hookClient: createHookClient(rows),
    worldId: 'world-1',
    entryEventId: 'evt-hidden-future',
  });

  assert.ok(detail);
  assert.equal(detail.title, 'Opening Clash');
  assert.equal(detail.recommendedSceneId, 'scene-docks');
  assert.deepEqual(detail.locationRefs, ['scene-docks']);
  assert.equal(detail.eventHorizon, 'PAST');
  assert.equal(detail.timelineSeq, 4);
  assert.match(detail.entryBackdrop, /Contraband dispute|scene-docks一带的局势正在发紧|night-watch前后的风声正在悄然扩散|Opening Clash前的风暴正在积聚/);
  assert.match(detail.entryHook, /发生前的临界时刻切入/);
  assert.equal(futureDetail, null);
});
