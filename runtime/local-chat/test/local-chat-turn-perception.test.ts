import test from 'node:test';
import assert from 'node:assert/strict';

import type { InteractionSnapshot, RelationMemorySlot } from '../src/state/index.ts';
import { pt } from '../src/prompt/prompt-locale.ts';
import { buildPerceptionCompactContext } from '../src/hooks/turn-send/perception-context.ts';
import { perceiveTurn } from '../src/hooks/turn-send/turn-perception.ts';

function buildOversizedRecentTurns(): Array<{ role: string; text: string }> {
  return Array.from({ length: 5 }, (_, index) => ({
    role: index % 2 === 0 ? 'assistant' : 'user',
    text: `RAW_MEDIA_PROMPT_MARKER_${index}:${'云海山风'.repeat(320)}`,
  }));
}

function buildOversizedMemorySlots(): RelationMemorySlot[] {
  return Array.from({ length: 6 }, (_, index) => ({
    id: `slot-${index + 1}`,
    targetId: 'agent.perception.test',
    viewerId: 'viewer.test',
    slotType: index % 2 === 0 ? 'preference' : 'promise',
    key: `memory-${index + 1}`,
    value: `MEMORY_VALUE_${index + 1}:${'月夜长风'.repeat(120)}`,
    confidence: 0.9,
    portability: 'portable',
    sensitivity: 'safe',
    userOverride: 'inherit',
    updatedAt: '2026-03-13T00:00:00.000Z',
  }));
}

function buildOversizedSnapshot(): InteractionSnapshot {
  return {
    conversationId: 'conv.perception.test',
    relationshipState: 'warm',
    activeScene: ['cloud-harbor'],
    emotionalTemperature: 'warm',
    assistantCommitments: [
      `COMMITMENT_A:${'星潮夜路'.repeat(40)}`,
      `COMMITMENT_B:${'风里慢行'.repeat(40)}`,
      `COMMITMENT_C:${'旧梦新灯'.repeat(40)}`,
    ],
    userPrefs: [
      `PREF_A:${'喜欢短句停顿'.repeat(40)}`,
      `PREF_B:${'喜欢夜色海风'.repeat(40)}`,
      `PREF_C:${'不喜欢催促'.repeat(40)}`,
    ],
    openLoops: [
      `OPEN_A:${'那张图还想再看看'.repeat(40)}`,
      `OPEN_B:${'还没把夜海说完'.repeat(40)}`,
      `OPEN_C:${'还有一段心事没讲'.repeat(40)}`,
    ],
    topicThreads: [
      `TOPIC_A:${'云海山巅'.repeat(40)}`,
      `TOPIC_B:${'灵界夜色'.repeat(40)}`,
      `TOPIC_C:${'海风与旧灯'.repeat(40)}`,
    ],
    lastResolvedTurnId: 'turn-1',
    conversationDirective: '先接住，再推进。',
    conversationMomentum: 'steady',
    updatedAt: '2026-03-13T00:00:00.000Z',
  };
}

test('buildPerceptionCompactContext keeps oversized continuity input within budgeted ceiling', () => {
  const compact = buildPerceptionCompactContext({
    userText: '我想看你的照片',
    snapshot: buildOversizedSnapshot(),
    memorySlots: buildOversizedMemorySlots(),
    recentTurns: buildOversizedRecentTurns(),
    promptLocale: 'zh',
    template: pt('zh', 'perception.template'),
  });

  assert.ok(compact.trace.promptChars <= 9000);
  assert.ok(compact.trace.recentTurnsChars <= 2400);
  assert.ok(compact.trace.relationMemoryChars <= 1400);
  assert.ok(compact.trace.snapshotChars <= 1200);
  assert.equal(compact.trace.compactionApplied, true);
  assert.match(compact.promptParts.userText, /我想看你的照片/u);

  const recentTurnLines = compact.promptParts.recentTurnsContext.split('\n').slice(1);
  for (const line of recentTurnLines) {
    assert.ok(line.length <= 380);
  }
});

test('perceiveTurn preserves explicit media and voice cues after compacting oversized context', async () => {
  const snapshot = buildOversizedSnapshot();
  const memorySlots = buildOversizedMemorySlots();
  const recentTurns = buildOversizedRecentTurns();
  const invokeInput = {
    capability: 'text.generate' as const,
    prompt: '',
    mode: 'STORY' as const,
    agentId: 'agent.perception.test',
  };

  const aiClient = {
    async generateObject(payload: Record<string, unknown>) {
      const prompt = String(payload.prompt || '');
      assert.ok(prompt.length <= 9000);
      const turnMode = prompt.includes('你可以用语音回答我吗') ? 'explicit-voice' : 'explicit-media';
      const object = {
        turnMode,
        emotionalState: null,
        relevantMemoryIds: [],
        conversationDirective: null,
        intimacyCeiling: 'warm',
      };
      return {
        object,
        text: JSON.stringify(object),
        traceId: `trace-${turnMode}`,
        promptTraceId: `trace-${turnMode}`,
        route: {
          source: 'local',
          model: 'chat-model',
          localModelId: 'chat-model',
        },
      };
    },
  };

  const mediaResult = await perceiveTurn({
    aiClient: aiClient as never,
    invokeInput,
    userText: '我想看你的照片',
    snapshot,
    memorySlots,
    recentTurns,
    promptLocale: 'zh',
  });
  assert.equal(mediaResult.turnMode, 'explicit-media');

  const voiceResult = await perceiveTurn({
    aiClient: aiClient as never,
    invokeInput,
    userText: '你可以用语音回答我吗',
    snapshot,
    memorySlots,
    recentTurns,
    promptLocale: 'zh',
  });
  assert.equal(voiceResult.turnMode, 'explicit-voice');
});
