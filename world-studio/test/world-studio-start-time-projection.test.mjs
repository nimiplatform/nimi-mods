import test from 'node:test';
import assert from 'node:assert/strict';
import {
  projectEventsForSelectedStartTime,
  START_TIME_PROJECTED_FUTURE_EVENT_KIND,
} from '../src/services/start-time-projection.ts';

function primary(id, timeRef, eventHorizon = 'PAST') {
  return {
    id,
    level: 'PRIMARY',
    eventHorizon,
    parentEventId: null,
    title: id,
    summary: '',
    cause: '',
    process: '',
    result: '',
    timeRef,
    locationRefs: [],
    characterRefs: [],
    dependsOnEventIds: [],
    evidenceRefs: [{ segmentId: `seg-${id}`, offsetStart: 0, offsetEnd: 1, excerpt: id, confidence: 0.8, sourceType: 'chunk' }],
    confidence: 0.8,
    needsEvidence: false,
  };
}

function secondary(id, parentEventId, timeRef, eventHorizon = 'PAST') {
  return {
    id,
    level: 'SECONDARY',
    eventHorizon,
    parentEventId,
    title: id,
    summary: '',
    cause: '',
    process: '',
    result: '',
    timeRef,
    locationRefs: [],
    characterRefs: [],
    dependsOnEventIds: [],
    evidenceRefs: [{ segmentId: `seg-${id}`, offsetStart: 0, offsetEnd: 1, excerpt: id, confidence: 0.7, sourceType: 'chunk' }],
    confidence: 0.7,
    needsEvidence: false,
  };
}

test('start-time projection splits current vs future event buckets', () => {
  const startTimeOptions = [
    { id: 't1', label: 'Chapter 1', description: '', weight: 0.5 },
    { id: 't2', label: 'Chapter 2', description: '', weight: 0.5 },
    { id: 't3', label: 'Chapter 3', description: '', weight: 0.5 },
  ];
  const events = {
    primary: [
      primary('p1', 'Chapter 1'),
      primary('p2', 'Chapter 2'),
      primary('p3', 'Chapter 3'),
    ],
    secondary: [
      secondary('s1', 'p1', 'Chapter 1'),
      secondary('s2', 'p3', 'Chapter 3'),
    ],
  };

  const projected = projectEventsForSelectedStartTime({
    selectedStartTimeId: 't2',
    startTimeOptions,
    timeline: [],
    events,
    futureHistoricalEvents: [],
  });

  assert.equal(projected.applied, true);
  assert.equal(projected.reasonCode, null);
  assert.deepEqual(projected.events.primary.map((item) => item.id), ['p1', 'p2']);
  assert.deepEqual(projected.events.secondary.map((item) => item.id), ['s1']);

  const futureIds = projected.futureHistoricalEvents
    .map((item) => String(item.id || ''))
    .filter(Boolean)
    .sort();
  assert.deepEqual(futureIds, ['p3', 's2']);
  assert.ok(projected.futureHistoricalEvents.every((item) => item.projectionKind === START_TIME_PROJECTED_FUTURE_EVENT_KIND));
  assert.ok(projected.futureHistoricalEvents.every((item) => item.eventHorizon === 'FUTURE'));
});

test('start-time projection is non-destructive and can restore future events', () => {
  const startTimeOptions = [
    { id: 't1', label: 'Chapter 1', description: '', weight: 0.5 },
    { id: 't2', label: 'Chapter 2', description: '', weight: 0.5 },
    { id: 't3', label: 'Chapter 3', description: '', weight: 0.5 },
  ];
  const base = {
    primary: [
      primary('p1', 'Chapter 1'),
      primary('p2', 'Chapter 2'),
      primary('p3', 'Chapter 3', 'ONGOING'),
    ],
    secondary: [],
  };

  const first = projectEventsForSelectedStartTime({
    selectedStartTimeId: 't1',
    startTimeOptions,
    timeline: [],
    events: base,
    futureHistoricalEvents: [],
  });
  assert.equal(first.applied, true);
  assert.equal(first.reasonCode, null);
  assert.deepEqual(first.events.primary.map((item) => item.id), ['p1']);
  assert.equal(first.futureHistoricalEvents.length, 2);
  assert.equal(first.futureHistoricalEvents.find((item) => item.id === 'p3')?.eventHorizon, 'FUTURE');
  assert.equal(
    first.futureHistoricalEvents.find((item) => item.id === 'p3')?.projectionOriginalEventHorizon,
    'ONGOING',
  );

  const second = projectEventsForSelectedStartTime({
    selectedStartTimeId: 't3',
    startTimeOptions,
    timeline: [],
    events: first.events,
    futureHistoricalEvents: first.futureHistoricalEvents,
  });

  assert.equal(second.applied, true);
  assert.equal(second.reasonCode, null);
  assert.deepEqual(second.events.primary.map((item) => item.id), ['p1', 'p2', 'p3']);
  assert.equal(second.futureHistoricalEvents.length, 0);
  assert.equal(second.events.primary.find((item) => item.id === 'p3')?.eventHorizon, 'ONGOING');
});

test('start-time projection supports temporal dependency ordering without explicit timeRef', () => {
  const startTimeOptions = [
    { id: 'event:p1', label: '1. Opening', description: '', weight: 0.6 },
    { id: 'event:p2', label: '2. Conflict', description: '', weight: 0.6 },
    { id: 'event:p3', label: '3. Resolution', description: '', weight: 0.6 },
  ];
  const events = {
    primary: [
      { ...primary('p1', ''), dependsOnEventIds: [] },
      { ...primary('p2', ''), dependsOnEventIds: ['p1'] },
      { ...primary('p3', ''), dependsOnEventIds: ['p2'] },
    ],
    secondary: [],
  };

  const projected = projectEventsForSelectedStartTime({
    selectedStartTimeId: 'event:p2',
    startTimeOptions,
    timeline: [],
    events,
    futureHistoricalEvents: [],
  });

  assert.equal(projected.applied, true);
  assert.equal(projected.reasonCode, null);
  assert.deepEqual(projected.events.primary.map((item) => item.id), ['p1', 'p2']);
  assert.deepEqual(
    projected.futureHistoricalEvents.map((item) => String(item.id || '')).filter(Boolean),
    ['p3'],
  );
});

test('start-time projection reports explicit failure when selected option cannot map to events', () => {
  const projected = projectEventsForSelectedStartTime({
    selectedStartTimeId: 'event:missing',
    startTimeOptions: [{ id: 'event:missing', label: 'Missing', description: '', weight: 0.5 }],
    timeline: [],
    events: {
      primary: [primary('p1', 'Chapter 1')],
      secondary: [],
    },
    futureHistoricalEvents: [],
  });

  assert.equal(projected.applied, false);
  assert.equal(projected.reasonCode, 'WORLD_STUDIO_START_TIME_EVENT_NOT_FOUND');
  assert.deepEqual(projected.events.primary.map((item) => item.id), ['p1']);
  assert.equal(projected.futureHistoricalEvents.length, 0);
});
