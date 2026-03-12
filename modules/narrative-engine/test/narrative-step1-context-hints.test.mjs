import test from 'node:test';
import assert from 'node:assert/strict';
import { runNarrativeStep1Assembly } from '../src/pipeline/step1-assembly.ts';

const NOW_MS = Date.parse('2026-03-03T00:00:00.000Z');

function makeTurn() {
  return {
    storyId: 'story_01KXTEXTPLAYSTEP1ENTRY123456789',
    entryEventId: 'event-past-1',
    worldId: 'world-1',
    agentId: 'agent-1',
    userId: 'user-1',
    triggerSource: 'UserTurn',
    userMessage: '我先观察局势，再决定是否动手。',
    systemContext: {},
    idempotencyKey: 'idem-step1-hints',
    capability: 'text.generate',
    binding: {},
    turnId: 'turn-step1-hints',
    requestId: 'request-step1-hints',
    traceId: 'trace-step1-hints',
    parentRunId: null,
    runId: 'run-step1-hints',
    taskId: 'task-step1-hints',
    presence: 'idle',
    nowMs: NOW_MS,
    cancelRequested: false,
    mockCoreOutput: null,
    receivedAt: new Date(NOW_MS).toISOString(),
  };
}

test('step1 compiles hidden future notes and advance hints for stagnation control', async () => {
  const result = await runNarrativeStep1Assembly({
    turn: makeTurn(),
    queryWorldEvents: async () => ([
      {
        id: 'event-past-1',
        title: '城门戒严',
        summary: '守军反复盘查来往行人，气氛压抑。',
        eventHorizon: 'PAST',
        level: 'PRIMARY',
        characterRefs: ['agent-1', 'player-1'],
        updatedAt: '2026-03-02T12:00:00.000Z',
      },
      {
        id: 'event-past-2',
        title: '街巷谣言扩散',
        summary: '茶楼里都在传城北有异动，却无人敢确认。',
        eventHorizon: 'PAST',
        level: 'SECONDARY',
        characterRefs: ['player-1'],
        updatedAt: '2026-03-02T12:10:00.000Z',
      },
      {
        id: 'event-past-3',
        title: '夜色压城',
        summary: '乌云低垂，城墙火把在风中忽明忽暗。',
        eventHorizon: 'PAST',
        level: 'SECONDARY',
        characterRefs: ['agent-1'],
        updatedAt: '2026-03-02T12:20:00.000Z',
      },
      {
        id: 'event-future-1',
        title: '伏兵封街',
        summary: '一旦钟楼讯号响起，主街将被迅速封锁。',
        result: '主角行动空间骤减',
        eventHorizon: 'FUTURE',
        level: 'PRIMARY',
        characterRefs: ['agent-1', 'player-1'],
        updatedAt: '2026-03-02T13:00:00.000Z',
      },
    ]),
    queryWorldLorebooks: async () => ([
      {
        id: 'lore-1',
        key: 'rule.city',
        content: '城内夜禁严苛，擅闯者就地扣押。',
        constant: true,
      },
    ]),
    queryWorldScenes: async () => ({
      items: [
        {
          id: 'scene-city-gate',
          name: '北城门',
          description: '风声卷着铁锈味，城门半掩。',
          activeEntities: ['agent-1', 'player-1'],
        },
      ],
    }),
    queryNarrativeContexts: async () => ({
      items: [
        {
          scope: 'CANON',
          narrativeSetting: {
            worldviewRules: ['城内夜禁严苛'],
          },
          narrativeState: {},
          updatedAt: '2026-03-02T10:00:00.000Z',
        },
        {
          scope: 'STORY',
          storyId: 'story.world-1.event-past-1',
          narrativeSetting: {
            initiativePolicy: {
              cooldownSeconds: 180,
              maxConsecutive: 3,
            },
          },
          narrativeState: {
            phase: 'rising',
            objective: '突围并确认异动源头',
            tension: 0.72,
            openThreads: ['谁在钟楼布置暗号', '守军为何临时增援'],
          },
          updatedAt: '2026-03-02T10:10:00.000Z',
        },
        {
          scope: 'SUBJECT',
          subjectId: 'agent-1',
          narrativeSetting: {},
          narrativeState: {},
          updatedAt: '2026-03-02T10:20:00.000Z',
        },
        {
          scope: 'RELATION',
          subjectId: 'agent-1',
          targetSubjectId: 'player-1',
          narrativeSetting: {},
          narrativeState: {},
          updatedAt: '2026-03-02T10:30:00.000Z',
        },
      ],
    }),
    queryAgentMemoryRecall: async () => ({
      core: [],
      e2e: [],
    }),
  });

  assert.equal(result.ok, true);
  const prompt = result.value.assets.compiledPrompt;
  assert.match(prompt, /## future-foreshadowing-hidden-notes/i);
  assert.match(prompt, /hidden author notes/i);
  assert.match(prompt, /## advance-hints/i);
  assert.match(prompt, /(low_action_plateau|tension_stagnation)/i);
  assert.match(prompt, /anti-spoiler/i);
  assert.equal(result.value.assets.promptStats.selectedCounts.advanceHints > 0, true);
});

test('step1 detects rhythm monotony when 3+ of last 5 spine events share same type', async () => {
  const recentSpineEvents = [
    { id: 'se-1', type: 'dialogue', visibility: 'public', payload: { content: 'a' } },
    { id: 'se-2', type: 'dialogue', visibility: 'public', payload: { content: 'b' } },
    { id: 'se-3', type: 'dialogue', visibility: 'public', payload: { content: 'c' } },
    { id: 'se-4', type: 'scene-beat', visibility: 'public', payload: { content: 'd' } },
    { id: 'se-5', type: 'dialogue', visibility: 'public', payload: { content: 'e' } },
  ];
  const result = await runNarrativeStep1Assembly({
    turn: makeTurn(),
    recentSpineEvents,
    queryRuntimeRouteOptions: async () => ({
      selected: { source: 'cloud', model: 'models/gemini-3-flash-preview', connectorId: 'c-1' },
    }),
    queryWorldEvents: async () => ([
      { id: 'event-1', title: '城门戒严', summary: '守军封锁。', eventHorizon: 'PAST', level: 'PRIMARY', characterRefs: ['agent-1', 'player-1'], updatedAt: '2026-03-02T12:00:00.000Z' },
    ]),
    queryWorldLorebooks: async () => ([
      { id: 'lore-1', key: 'rule.city', content: '夜禁。', constant: true },
    ]),
    queryWorldScenes: async () => ({ items: [
      { id: 'scene-1', name: '北城门', description: '城门半掩。', activeEntities: ['agent-1'] },
    ]}),
    queryNarrativeContexts: async () => ({ items: [
      { scope: 'CANON', narrativeSetting: { worldviewRules: ['夜禁'] }, narrativeState: {}, updatedAt: '2026-03-02T10:00:00.000Z' },
      { scope: 'STORY', storyId: 'story.world-1.event-past-1', narrativeSetting: {}, narrativeState: { phase: 'rising', objective: '突围', tension: 0.5, openThreads: [] }, updatedAt: '2026-03-02T10:10:00.000Z' },
    ]}),
    queryAgentMemoryRecall: async () => ({ core: [], e2e: [] }),
  });

  assert.equal(result.ok, true);
  const prompt = result.value.assets.compiledPrompt;
  assert.match(prompt, /rhythm_monotony/i);
  assert.match(prompt, /dialogue_stagnation/i);
});

test('step1 does not generate rhythm hints when no spine history provided', async () => {
  const result = await runNarrativeStep1Assembly({
    turn: makeTurn(),
    queryRuntimeRouteOptions: async () => ({
      selected: { source: 'cloud', model: 'models/gemini-3-flash-preview', connectorId: 'c-1' },
    }),
    queryWorldEvents: async () => ([
      { id: 'event-1', title: '城门戒严', summary: '守军封锁。', eventHorizon: 'PAST', level: 'PRIMARY', characterRefs: ['agent-1', 'player-1'], updatedAt: '2026-03-02T12:00:00.000Z' },
    ]),
    queryWorldLorebooks: async () => ([
      { id: 'lore-1', key: 'rule.city', content: '夜禁。', constant: true },
    ]),
    queryWorldScenes: async () => ({ items: [
      { id: 'scene-1', name: '北城门', description: '城门半掩。', activeEntities: ['agent-1'] },
    ]}),
    queryNarrativeContexts: async () => ({ items: [
      { scope: 'CANON', narrativeSetting: { worldviewRules: ['夜禁'] }, narrativeState: {}, updatedAt: '2026-03-02T10:00:00.000Z' },
      { scope: 'STORY', storyId: 'story.world-1.event-past-1', narrativeSetting: {}, narrativeState: { phase: 'rising', objective: '突围', tension: 0.5, openThreads: [] }, updatedAt: '2026-03-02T10:10:00.000Z' },
    ]}),
    queryAgentMemoryRecall: async () => ({ core: [], e2e: [] }),
  });

  assert.equal(result.ok, true);
  const prompt = result.value.assets.compiledPrompt;
  assert.equal(prompt.includes('rhythm_monotony'), false);
  assert.equal(prompt.includes('dialogue_stagnation'), false);
});
