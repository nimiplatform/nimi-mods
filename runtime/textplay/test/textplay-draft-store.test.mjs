import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTextplayDraftKey,
  buildTextplayDraftWorldScope,
  deleteTextplayDraft,
  listTextplayDraftsByWorldScope,
  loadTextplayDraft,
  saveTextplayDraft,
} from '../src/draft-store.ts';

function createDraft(overrides = {}) {
  const userId = String(overrides.userId || 'user-1');
  const worldId = String(overrides.worldId || 'world-1');
  const storyId = String(overrides.storyId || 'story_01KXTEXTPLAYDRAFT1234567890');
  const agentId = String(overrides.agentId || 'agent-1');
  const key = buildTextplayDraftKey({ userId, worldId, storyId, agentId });
  const worldScope = buildTextplayDraftWorldScope({ userId, worldId });
  return {
    key,
    worldScope,
    userId,
    worldId,
    storyId,
    agentId,
    entryEventId: String(overrides.entryEventId || 'evt-opening'),
    sessionId: String(overrides.sessionId || 'session_01KXTEXTPLAYDRAFT1234567890'),
    status: overrides.status || 'active',
    playerName: String(overrides.playerName || 'Han Yun'),
    playerIdentity: String(overrides.playerIdentity || 'Dock courier'),
    entryTitle: String(overrides.entryTitle || 'Opening Clash'),
    agentName: String(overrides.agentName || 'Han Li'),
    agentAvatar: overrides.agentAvatar || null,
    startupPackage: overrides.startupPackage || {
      storyId,
      worldId,
      entryEventId: 'evt-opening',
      entry: {
        entryEventId: 'evt-opening',
        worldId,
        timelineSeq: 4,
        title: 'Opening Clash',
        summary: 'Harbor pressure rises.',
        entryBackdrop: 'Harbor pressure rises while the cordon tightens.',
        entryHook: '你将从目标事件真正发生前的临界时刻切入，亲手塑造之后的走向。',
        participants: ['agent-1'],
        characterRefs: ['agent-1'],
        eventHorizon: 'PAST',
        entryMode: 'PRE_EVENT',
        updatedAt: '2026-03-02T10:00:00.000Z',
        playable: true,
        cause: 'cause',
        process: 'process',
        result: 'result',
        timeRef: 'time',
        locationRefs: [],
        recommendedSceneId: null,
      },
      cast: { primaryAgentId: agentId, participants: ['agent-1'] },
      background: { summary: 'background' },
      materials: { lorebooks: [], memories: [], scenes: [], contexts: [], recallSource: 'none' },
      narrativeScopes: { CANON: {}, STORY: {}, SUBJECT: {}, RELATION: {} },
      recommendedEntryTurn: null,
      startupPolicy: {
        initiative: {
          enabled: true,
          tickSeconds: 10,
          cooldownSeconds: 180,
          maxConsecutive: 3,
          idleSeconds: 120,
          pausedSeconds: 180,
          highTensionIdleSeconds: 180,
          awaySeconds: 300,
          highTensionThreshold: 0.7,
          blockedPresenceStates: ['active'],
        },
        pacing: { targetTension: 0.6, tensionBand: [0.45, 0.75], beatDensity: 0.5, curve: 'steady-rise' },
      },
      snapshot: {
        storyId,
        entryEventId: 'evt-opening',
        primaryAgentId: agentId,
        version: 'test',
        source: 'test',
        loadedAt: '2026-03-02T10:00:00.000Z',
        contextCoverage: { canon: true, story: true, subject: false, relation: false, scene: false },
        gapWarnings: [],
      },
    },
    engineSnapshot: overrides.engineSnapshot || {
      version: 1,
      storyId,
      turnIds: [],
      latestTurnId: null,
      turns: {},
      projections: {},
      spineEvents: [],
      contexts: { CANON: {}, STORY: {}, SUBJECT: {}, RELATION: {} },
      initiativeState: {
        lastFiredAt: null,
        consecutive: 0,
        lastSceneFingerprint: null,
      },
    },
    records: overrides.records || [],
    routeOverride: overrides.routeOverride || null,
    createdAt: String(overrides.createdAt || '2026-03-02T10:00:00.000Z'),
    updatedAt: String(overrides.updatedAt || '2026-03-02T10:00:00.000Z'),
  };
}

test('draft-store saves, loads, lists by worldScope, and deletes drafts', async () => {
  const draftA = createDraft({
    storyId: 'story_01KXTEXTPLAYDRAFTA123456789',
    updatedAt: '2026-03-02T10:00:00.000Z',
  });
  const draftB = createDraft({
    storyId: 'story_01KXTEXTPLAYDRAFTB123456789',
    sessionId: 'session_01KXTEXTPLAYDRAFTB123456789',
    updatedAt: '2026-03-02T11:00:00.000Z',
  });

  await saveTextplayDraft(draftA);
  await saveTextplayDraft(draftB);

  const loadedA = await loadTextplayDraft(draftA.key);
  const drafts = await listTextplayDraftsByWorldScope(draftA.worldScope);

  assert.equal(loadedA?.storyId, draftA.storyId);
  assert.deepEqual(drafts.map((item) => item.storyId), [draftB.storyId, draftA.storyId]);

  await deleteTextplayDraft(draftA.key);
  await deleteTextplayDraft(draftB.key);

  assert.equal(await loadTextplayDraft(draftA.key), null);
  assert.deepEqual(await listTextplayDraftsByWorldScope(draftA.worldScope), []);
});
