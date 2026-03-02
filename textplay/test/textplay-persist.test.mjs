import test from 'node:test';
import assert from 'node:assert/strict';
import { TEXTPLAY_REASON } from '../src/contracts.ts';
import { persistTextplayRenderBestEffort } from '../src/pipeline/persist-best-effort.ts';
import {
  getTextplayPersistRunEvents,
  upsertTextplayPersistRecord,
} from '../src/persist/store.ts';

function installMemoryLocalStorage() {
  const map = new Map();
  const storage = {
    get length() {
      return map.size;
    },
    key(index) {
      return [...map.keys()][index] || null;
    },
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(String(key), String(value));
    },
    removeItem(key) {
      map.delete(String(key));
    },
    clear() {
      map.clear();
    },
  };

  const previous = globalThis.localStorage;
  globalThis.localStorage = storage;

  return () => {
    if (previous) {
      globalThis.localStorage = previous;
      return;
    }
    delete globalThis.localStorage;
  };
}

function createPersistRecord() {
  const runSnapshot = {
    status: 'RUNNING',
    lastSeq: 4,
    lastCompletedStep: 'wrap-output',
    checkpointToken: 'checkpoint-1',
    stepInputHash: 'hash-1',
    lastCompletedUnit: 'wrap-output',
    gapRefillApplied: false,
    terminalEventType: undefined,
  };

  const runEvents = [
    {
      traceId: 'trace-1',
      runId: 'run-1',
      parentRunId: null,
      taskId: 'task-1',
      stage: 'textplay',
      step: 'normalize',
      eventType: 'step.complete',
      seq: 1,
      attempt: 1,
      timestamp: '2026-03-02T10:00:00.000Z',
      checkpointToken: 'checkpoint-1',
      stepInputHash: 'hash-1',
      lastCompletedUnit: 'normalize',
    },
    {
      traceId: 'trace-1',
      runId: 'run-1',
      parentRunId: null,
      taskId: 'task-1',
      stage: 'textplay',
      step: 'generate',
      eventType: 'step.complete',
      seq: 4,
      attempt: 1,
      timestamp: '2026-03-02T10:00:01.000Z',
      checkpointToken: 'checkpoint-2',
      stepInputHash: 'hash-1',
      lastCompletedUnit: 'generate',
    },
  ];

  return {
    storyId: 'story-1',
    turnId: 'turn-1',
    runId: 'run-1',
    traceId: 'trace-1',
    triggerSource: 'UserTurn',
    playerId: 'player-1',
    userMessage: 'look around',
    systemPayload: null,
    text: 'The hallway opens and the lights flicker twice.',
    meta: {
      storyId: 'story-1',
      turnId: 'turn-1',
      runId: 'run-1',
      traceId: 'trace-1',
      promptTraceId: 'prompt-1',
      route: {
        source: 'token-api',
        connectorId: 'connector-main',
        model: 'gpt-4.1-mini',
        provider: 'openai',
        endpoint: 'https://example.invalid/v1/chat/completions',
      },
      sourceEventIds: ['spine-001'],
      warnings: [],
      presenceReports: [],
      runSnapshot,
    },
    runEvents,
    runSnapshot,
    warnings: [],
    presenceReports: [],
  };
}

test('persist best effort returns non-blocking warning on failure', async () => {
  const warning = await persistTextplayRenderBestEffort({
    hookClient: {
      data: {
        query: async () => {
          throw new Error('persist-down');
        },
      },
    },
    normalized: {
      storyId: 'story-1',
      worldId: 'world-1',
      agentId: 'agent-1',
      turnId: 'turn-1',
      runId: 'run-1',
      traceId: 'trace-1',
      triggerSource: 'UserTurn',
      playerId: 'player-1',
      userMessage: 'hello',
      systemPayload: null,
      sceneSummary: 'A market square at dusk.',
      agentSummary: 'A merchant waits under a lantern.',
      worldStyleSummary: 'Grounded fantasy.',
      events: [],
      metrics: {},
    },
    text: 'A lantern swings in the wind.',
    meta: {
      storyId: 'story-1',
      turnId: 'turn-1',
    },
    runEvents: [],
    runSnapshot: {
      status: 'RUNNING',
      lastSeq: 0,
      lastCompletedStep: 'received',
      checkpointToken: 'checkpoint-1',
      stepInputHash: 'hash-1',
      lastCompletedUnit: 'received',
      gapRefillApplied: false,
    },
    warnings: [],
    presenceReports: [],
  });

  assert.ok(warning);
  assert.equal(warning.code, TEXTPLAY_REASON.PERSISTENCE_FAILED_WARN);
});

test('getRun(afterSeq) reports gapRefillApplied when sequence gap is detected', () => {
  const restoreStorage = installMemoryLocalStorage();
  try {
    upsertTextplayPersistRecord(createPersistRecord());

    const result = getTextplayPersistRunEvents({
      runId: 'run-1',
      afterSeq: 1,
      limit: 20,
    });

    assert.equal(result.record?.runId, 'run-1');
    assert.equal(result.gapRefillApplied, true);
    assert.equal(result.events.length > 0, true);
    assert.equal(result.events[0].seq, 4);
  } finally {
    restoreStorage();
  }
});
