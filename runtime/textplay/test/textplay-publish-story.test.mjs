import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTextplaySpinePublishBody, publishTextplayStoryDraft } from '../src/data/publish-story.ts';
import { TEXTPLAY_DATA_API_WORLD_SPINE_PUBLISH } from '../src/contracts.ts';

function createDraft() {
  return {
    key: 'user-1::world-1::story_01KXTEXTPLAYPUBLISH1234567::agent-1',
    worldScope: 'user-1::world-1',
    userId: 'user-1',
    worldId: 'world-1',
    storyId: 'story_01KXTEXTPLAYPUBLISH1234567',
    agentId: 'agent-1',
    entryEventId: 'evt-opening',
    sessionId: 'session_01KXTEXTPLAYPUBLISH12345',
    status: 'active',
    playerName: 'Han Yun',
    playerIdentity: 'Dock courier',
    entryTitle: 'Opening Clash',
    agentName: 'Han Li',
    agentAvatar: null,
    startupPackage: {
      storyId: 'story_01KXTEXTPLAYPUBLISH1234567',
      worldId: 'world-1',
      entryEventId: 'evt-opening',
      entry: {
        entryEventId: 'evt-opening',
        worldId: 'world-1',
        timelineSeq: 4,
        title: 'Opening Clash',
        summary: 'The harbor tenses before the breach.',
        entryBackdrop: 'Rain-soaked docks and contraband pressure leave the harbor on edge.',
        entryHook: '你将从目标事件真正发生前的临界时刻切入，亲手塑造之后的走向。',
        participants: ['agent-1', 'agent-2'],
        characterRefs: ['agent-1', 'agent-2'],
        eventHorizon: 'PAST',
        entryMode: 'PRE_EVENT',
        updatedAt: '2026-03-02T10:00:00.000Z',
        playable: true,
        cause: 'cause',
        process: 'process',
        result: 'result',
        timeRef: 'night-watch',
        locationRefs: ['scene-docks'],
        recommendedSceneId: 'scene-docks',
      },
      cast: {
        primaryAgentId: 'agent-1',
        participants: ['agent-1', 'agent-2'],
      },
      background: { summary: 'The docks are rain-soaked and unstable.' },
      materials: {
        lorebooks: [],
        memories: [],
        scenes: [{ id: 'scene-docks', name: 'Iron Docks', description: 'Rain hammers the mooring towers.', score: 10 }],
        contexts: [],
        recallSource: 'none',
      },
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
        storyId: 'story_01KXTEXTPLAYPUBLISH1234567',
        entryEventId: 'evt-opening',
        primaryAgentId: 'agent-1',
        version: 'test',
        source: 'test',
        loadedAt: '2026-03-02T10:00:00.000Z',
        contextCoverage: { canon: true, story: true, subject: true, relation: true, scene: true },
        gapWarnings: [],
      },
    },
    engineSnapshot: {
      version: 1,
      storyId: 'story_01KXTEXTPLAYPUBLISH1234567',
      turnIds: ['turn-1'],
      latestTurnId: 'turn-1',
      turns: {
        'turn-1': {
          storyId: 'story_01KXTEXTPLAYPUBLISH1234567',
          turnId: 'turn-1',
          runId: 'run-1',
          traceId: 'trace-1',
          triggerSource: 'UserTurn',
          input: {
            userMessage: 'I move toward the signal mast.',
          },
          coreOutput: {
            spineEvents: [
              {
                id: 'evt-local-1',
                type: 'scene-beat',
                visibility: 'public',
                payload: {
                  summary: 'The dock ropes snap under fresh strain.',
                },
                sourceEventIds: ['source-1'],
                owner: 'agent-1',
              },
            ],
          },
          createdAt: '2026-03-02T10:00:00.000Z',
          updatedAt: '2026-03-02T10:00:00.000Z',
        },
      },
      projections: {},
      spineEvents: [
        {
          id: 'evt-local-1',
          type: 'scene-beat',
          visibility: 'public',
          payload: {
            summary: 'The dock ropes snap under fresh strain.',
          },
        },
      ],
      contexts: { CANON: {}, STORY: {}, SUBJECT: {}, RELATION: {} },
      initiativeState: {
        lastFiredAt: null,
        consecutive: 0,
        lastSceneFingerprint: null,
      },
    },
    records: [
      {
        id: 'record-1',
        storyId: 'story_01KXTEXTPLAYPUBLISH1234567',
        worldId: 'world-1',
        agentId: 'agent-1',
        turnId: 'turn-1',
        runId: 'run-1',
        traceId: 'trace-1',
        triggerSource: 'UserTurn',
        userId: 'user-1',
        playerName: 'Han Yun',
        playerIdentity: 'Dock courier',
        userMessage: 'I move toward the signal mast.',
        systemPayload: null,
        text: 'You cross the slick planks while the harbor braces for impact.',
        meta: {
          storyId: 'story_01KXTEXTPLAYPUBLISH1234567',
          turnId: 'turn-1',
          runId: 'run-1',
          traceId: 'trace-1',
          promptTraceId: 'prompt-1',
          route: {
            source: 'cloud',
            connectorId: 'connector-1',
            model: 'gemini-3-flash-preview',
            provider: 'api',
            endpoint: 'https://example.invalid/v1',
          },
          sourceEventIds: ['evt-local-1'],
          warnings: [],
          presenceReports: [],
          runSnapshot: {
            status: 'COMPLETED',
            lastSeq: 7,
            lastCompletedStep: 'persist-best-effort',
            checkpointToken: 'checkpoint-1',
            stepInputHash: 'hash-1',
            lastCompletedUnit: 'persist-best-effort',
            gapRefillApplied: false,
          },
        },
        runEvents: [],
        runSnapshot: {
          status: 'COMPLETED',
          lastSeq: 7,
          lastCompletedStep: 'persist-best-effort',
          checkpointToken: 'checkpoint-1',
          stepInputHash: 'hash-1',
          lastCompletedUnit: 'persist-best-effort',
          gapRefillApplied: false,
        },
        warnings: [],
        presenceReports: [],
        createdAt: '2026-03-02T10:00:00.000Z',
        updatedAt: '2026-03-02T10:00:00.000Z',
      },
    ],
    routeOverride: null,
    createdAt: '2026-03-02T10:00:00.000Z',
    updatedAt: '2026-03-02T10:00:00.000Z',
  };
}

test('buildTextplaySpinePublishBody converts draft snapshot into one event chain plus turn satellites', () => {
  const draft = createDraft();
  const body = buildTextplaySpinePublishBody(draft);

  assert.equal(body.events.length, 1);
  assert.equal(body.satellites.length, 1);
  assert.equal(body.events[0].payload.type, 'OBSERVATION');
  assert.equal(body.events[0].payload.metadata.storyId, draft.storyId);
  assert.equal(body.events[0].payload.metadata.entryEventId, draft.entryEventId);
  assert.equal(body.satellites[0].type, 'DETAIL');
  assert.equal(body.satellites[0].spineEventId, body.events[0].id);

  const artifact = JSON.parse(body.satellites[0].content);
  assert.equal(artifact.storyId, draft.storyId);
  assert.equal(artifact.sessionId, draft.sessionId);
  assert.equal(artifact.userId, draft.userId);
  assert.equal(artifact.playerIdentity, draft.playerIdentity);
});

test('publishTextplayStoryDraft sends story-scoped publish query', async () => {
  const draft = createDraft();
  let captured = null;
  const hookClient = {
    data: {
      query: async (payload) => {
        captured = payload;
        return { ok: true };
      },
    },
  };

  await publishTextplayStoryDraft({
    hookClient,
    draft,
  });

  assert.equal(captured.capability, TEXTPLAY_DATA_API_WORLD_SPINE_PUBLISH);
  assert.equal(captured.query.worldId, draft.worldId);
  assert.equal(captured.query.storyId, draft.storyId);
  assert.equal(captured.query.agentId, draft.agentId);
  assert.equal(Array.isArray(captured.query.body.events), true);
  assert.equal(Array.isArray(captured.query.body.satellites), true);
});
