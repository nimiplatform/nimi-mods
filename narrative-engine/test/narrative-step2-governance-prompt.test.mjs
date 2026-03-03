import test from 'node:test';
import assert from 'node:assert/strict';
import { runNarrativeStep2Generate } from '../src/pipeline/step2-generate.ts';

function makeTurn() {
  const nowMs = Date.parse('2026-03-03T00:10:00.000Z');
  return {
    storyId: 'story.world.event-2',
    worldId: 'world-1',
    agentId: 'agent-1',
    playerId: 'player-1',
    triggerSource: 'UserTurn',
    userMessage: '我尝试潜入钟楼查看暗号来源。',
    systemContext: {},
    idempotencyKey: 'idem-step2-governance',
    routeHint: '',
    routeOverride: {},
    turnId: 'turn-step2-governance',
    requestId: 'request-step2-governance',
    traceId: 'trace-step2-governance',
    parentRunId: null,
    runId: 'run-step2-governance',
    taskId: 'task-step2-governance',
    presence: 'idle',
    nowMs,
    cancelRequested: false,
    mockCoreOutput: null,
    receivedAt: new Date(nowMs).toISOString(),
  };
}

test('step2 prompt includes governance priorities and mandatory self-review rules', async () => {
  const prompts = [];
  const result = await runNarrativeStep2Generate({
    turn: makeTurn(),
    assembly: {
      snapshot: {
        place: '北城钟楼',
        worldviewRules: ['夜禁严苛'],
        sceneMaterial: ['守军增援', '钟楼封锁'],
        availableActors: ['agent-1', 'player-1'],
        narrativeStyle: {},
        characterRelations: [],
        phase: 'rising',
        objective: '确认暗号来源',
        tensionTarget: 0.65,
        openThreads: ['谁在钟楼布置暗号'],
        startupPolicy: {},
        futurePressure: ['封街'],
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
      },
      assets: {
        routeOptions: {
          selected: {
            source: 'token-api',
            model: 'models/gemini-3-flash-preview',
            connectorId: 'connector-1',
          },
        },
        compiledPrompt: '## context\nstory-state=active',
        promptStats: {
          sectionChars: {},
          totalPromptChars: 24,
          sourceCounts: {
            worldEvents: 1,
            worldLorebooks: 1,
            worldScenes: 1,
            narrativeContexts: 1,
            memoryItems: 0,
          },
          selectedCounts: {
            timelineEvents: 1,
            futureEvents: 1,
            advanceHints: 1,
            lorebooks: 1,
            scenes: 1,
            relations: 0,
            memories: 0,
          },
        },
      },
    },
    generateText: async (payload) => {
      prompts.push(payload.prompt);
      return {
        text: JSON.stringify({
          spineEvents: [
            {
              id: 'evt-1',
              type: 'scene-beat',
              visibility: 'public',
              payload: {
                description: '钟楼阴影下，守军交接出现短暂空档。',
              },
            },
          ],
          stateChanges: {},
          metrics: {
            coherence: 0.82,
            groundedRatio: 0.9,
            tension: 0.61,
          },
        }),
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(prompts.length >= 1, true);
  const prompt = String(prompts[0] || '');
  assert.match(prompt, /Constraint Priority \(P0-P4\)/);
  assert.match(prompt, /Anti-people-pleasing rule/i);
  assert.match(prompt, /Self-Review \(Mandatory Before Output\)/);
  assert.match(prompt, /extraordinary player claims, generate proportionate skepticism/i);
});
