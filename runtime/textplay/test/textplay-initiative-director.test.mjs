import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInitiativeDirectorMessage } from '../src/hooks/story-briefing.ts';

function createStartup(overrides = {}) {
  return {
    storyId: 'story.world-1.evt-1',
    worldId: 'world-1',
    entryEventId: 'evt-1',
    storyLanguage: 'zh',
    entry: {
      title: '诛杀真仙马良',
      summary: '大战将启',
      cause: '真仙威压降临',
      process: '灵界防线摇摇欲坠',
      result: '',
      timeRef: '战前片刻',
      locationRefs: ['灵界'],
      characterRefs: ['韩立'],
      recommendedSceneId: 'scene-1',
    },
    cast: {
      primaryAgentId: 'agent-1',
      participants: ['agent-1', 'player-1'],
    },
    background: {
      summary: '灵界诸宗正在集结。',
    },
    materials: {
      lorebooks: [],
      memories: [],
      scenes: [{ id: 'scene-1', name: '灵界战场', description: '战云压顶', score: 1 }],
      contexts: [],
      recallSource: 'remote-only',
    },
    narrativeScopes: {
      CANON: {},
      STORY: {
        openThreads: ['灵阵缺口扩大', '后方补给线受阻'],
        pendingEvents: ['先锋军将于半炷香后抵达'],
        conflicts: ['高空仙压与地面防线冲突'],
        npcsWithAgenda: ['韩立要先稳住阵眼'],
      },
      SUBJECT: {},
      RELATION: {},
    },
    recommendedEntryTurn: null,
    startupPolicy: {
      initiative: {
        enabled: true,
        tickSeconds: 10,
        cooldownSeconds: 180,
        maxConsecutive: 3,
        blockedPresenceStates: ['active', 'composing'],
      },
      pacing: {
        targetTension: 0.65,
        tensionBand: [0.45, 0.8],
        beatDensity: 0.6,
        curve: 'steady-rise',
      },
    },
    snapshot: {
      storyId: 'story.world-1.evt-1',
      worldId: 'world-1',
      entryEventId: 'evt-1',
      primaryAgentId: 'agent-1',
      source: 'textplay:start',
      loadedAt: '2026-03-03T00:00:00.000Z',
      version: 'h1',
      contextCoverage: {
        canon: true,
        story: true,
        subject: true,
        relation: true,
        scene: true,
      },
      gapWarnings: [],
    },
    ...overrides,
  };
}

test('initiative director avoids recently used hook and picks fresh open thread', () => {
  const startup = createStartup();
  const records = [
    {
      userMessage: '围绕灵阵缺口扩大继续推进',
      text: '前线仍在围绕灵阵缺口扩大展开争夺。',
    },
  ];

  const result = buildInitiativeDirectorMessage({
    promptLanguage: 'zh',
    startup,
    records,
    playerName: '云澜',
  });

  assert.equal(result.strategy, 'open-thread');
  assert.match(result.directive, /后方补给线受阻/);
  assert.match(result.directive, /云澜/);
});

test('initiative director falls back to entry process when no hooks are available', () => {
  const startup = createStartup({
    narrativeScopes: {
      CANON: {},
      STORY: {},
      SUBJECT: {},
      RELATION: {},
    },
    materials: {
      lorebooks: [],
      memories: [],
      scenes: [{ id: 'scene-1', name: '灵界战场', description: '战云压顶', score: 1 }],
      contexts: [],
      recallSource: 'remote-only',
    },
  });

  const result = buildInitiativeDirectorMessage({
    promptLanguage: 'zh',
    startup,
    records: [],
    playerName: '',
  });

  assert.equal(result.strategy, 'fallback');
  assert.match(result.directive, /灵界防线摇摇欲坠/);
  assert.match(result.directive, /玩家/);
});
