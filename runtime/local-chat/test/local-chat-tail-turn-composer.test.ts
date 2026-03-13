import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSealedFirstBeatRe, TAIL_ONLY_RULE_RE } from './helpers/prompt-matchers.mjs';
import type { LocalChatContextPacket } from '../src/state/index.ts';
import type { LocalChatTurnAiClient } from '../src/hooks/turn-send/types.ts';
import { composeInteractionTurnPlan } from '../src/hooks/turn-send/turn-composer.ts';

function createContextPacket(): LocalChatContextPacket {
  return {
    voiceConversationMode: 'off',
    target: {
      interactionProfile: {
        expression: {
          pacingBias: 'balanced',
        },
      },
    },
  } as LocalChatContextPacket;
}

test('tail turn composer degrades to first-beat-only when planner call fails', async () => {
  const plan = await composeInteractionTurnPlan({
    aiClient: {
      generateObject: async () => {
        throw new Error('planner failed');
      },
    } as unknown as LocalChatTurnAiClient,
    invokeInput: {
      capability: 'text.generate',
      prompt: 'raw prompt',
      mode: 'STORY',
      agentId: 'agent-1',
    },
    contextPacket: createContextPacket(),
    userText: '我今天真的好累',
    turnId: 'turn-1',
    turnMode: 'emotional',
    deliveryStyle: 'natural',
    sealedFirstBeatText: '真的辛苦你了，先让我接住你。',
  });

  assert.equal(plan.turnId, 'turn-1');
  assert.equal(plan.beats.length, 0);
  assert.equal(plan.fallbackPolicy, 'first-beat-only');
});

test('tail turn composer passes sealed first beat into planner and prunes duplicate tail beats', async () => {
  let capturedPrompt = '';
  const plan = await composeInteractionTurnPlan({
    aiClient: {
      generateObject: async (input: { prompt?: string }) => {
        const { prompt } = input;
        capturedPrompt = String(prompt || '');
        return {
          object: {
            beats: [
              {
                text: '真的辛苦你了，先让我接住你。',
                intent: 'comfort',
                relationMove: 'warm',
                sceneMove: '安慰',
                pauseMs: 420,
              },
              {
                text: '先别一个人扛着，把最压你的那件事慢慢告诉我。',
                intent: 'invite',
                relationMove: 'warm',
                sceneMove: '深入',
                pauseMs: 760,
              },
            ],
          },
          text: '',
          traceId: 'trace-tail',
          promptTraceId: 'trace-tail',
          route: {
            source: 'local',
            model: 'model-a',
            provider: 'local',
            connectorId: '',
            endpoint: '',
            localOpenAiEndpoint: '',
            localProviderEndpoint: '',
            localModelId: '',
            adapter: 'test',
            capability: 'text.generate',
          },
        };
      },
    } as unknown as LocalChatTurnAiClient,
    invokeInput: {
      capability: 'text.generate',
      prompt: 'raw prompt',
      mode: 'STORY',
      agentId: 'agent-1',
    },
    contextPacket: createContextPacket(),
    userText: '我今天真的好累',
    turnId: 'turn-2',
    turnMode: 'emotional',
    deliveryStyle: 'compact',
    recentBeatTexts: ['真的辛苦你了，先让我接住你。'],
    sealedFirstBeatText: '真的辛苦你了，先让我接住你。',
  });

  assert.match(capturedPrompt, buildSealedFirstBeatRe('真的辛苦你了，先让我接住你。'));
  assert.match(capturedPrompt, TAIL_ONLY_RULE_RE);
  assert.match(capturedPrompt, /deliveryStyle=compact/u);
  assert.equal(plan.beats.length, 1);
  assert.equal(plan.beats[0]?.text, '先别一个人扛着，把最压你的那件事慢慢告诉我。');
  assert.equal(plan.beats[0]?.beatIndex, 1);
  assert.equal(plan.beats[0]?.beatCount, 2);
  assert.equal(plan.fallbackPolicy, 'first-beat-only');
});

test('tail turn composer logs structured failure stage for generateObject errors', async () => {
  const originalConsoleError = console.error;
  const captured: unknown[] = [];
  console.error = (...args: unknown[]) => {
    captured.push(args);
  };

  try {
    const plan = await composeInteractionTurnPlan({
      aiClient: {
        generateObject: async () => {
          const error = new Error('LOCAL_CHAT_AI_GENERATE_OBJECT_PARSE_FAILED') as Error & Record<string, unknown>;
          error.failureStage = 'parse';
          error.reasonCode = 'LOCAL_CHAT_AI_GENERATE_OBJECT_INVALID_JSON_OBJECT';
          error.actionHint = 'emit_valid_json_only';
          error.traceId = 'trace-composer-parse';
          error.rawTextPreview = '{"beats":[';
          error.rawTextChars = 10;
          error.errorName = 'Error';
          throw error;
        },
      } as unknown as LocalChatTurnAiClient,
      invokeInput: {
        capability: 'text.generate',
        prompt: 'raw prompt',
        mode: 'STORY',
        agentId: 'agent-1',
      },
      contextPacket: createContextPacket(),
      userText: '给我发张图',
      turnId: 'turn-log-1',
      turnMode: 'explicit-media',
      deliveryStyle: 'natural',
      sealedFirstBeatText: '我这就给你准备。',
    });

    assert.equal(plan.beats.length, 0);
    const failureLog = captured.find((entry) =>
      Array.isArray(entry)
      && entry[0] === '[turn-composer] generateObject: FAILED',
    ) as [string, Record<string, unknown>] | undefined;
    assert.equal(Boolean(failureLog), true);
    assert.equal(failureLog?.[1]?.failureStage, 'parse');
    assert.equal(failureLog?.[1]?.reasonCode, 'LOCAL_CHAT_AI_GENERATE_OBJECT_INVALID_JSON_OBJECT');
    assert.equal(failureLog?.[1]?.actionHint, 'emit_valid_json_only');
    assert.equal(failureLog?.[1]?.traceId, 'trace-composer-parse');
    assert.equal(failureLog?.[1]?.rawTextPreview, '{"beats":[');
  } finally {
    console.error = originalConsoleError;
  }
});

test('tail turn composer increases explicit-media maxTokens after a length-truncated parse failure', async () => {
  const calls: Array<{ maxTokens?: number; prompt?: string }> = [];

  const plan = await composeInteractionTurnPlan({
    aiClient: {
      generateObject: async (input: { maxTokens?: number; prompt?: string }) => {
        calls.push(input);
        if (calls.length === 1) {
          const error = new Error('LOCAL_CHAT_AI_GENERATE_OBJECT_PARSE_FAILED') as Error & Record<string, unknown>;
          error.failureStage = 'parse';
          error.reasonCode = 'JSON Parse error: Expected \':\' before value in object property definition';
          error.traceId = 'trace-composer-length';
          error.finishReason = 'length';
          error.rawTextPreview = '{"beats":[{"text":"这便是我现在的模样","assetRe';
          error.rawTextChars = 96;
          error.errorName = 'SyntaxError';
          throw error;
        }
        return {
          object: {
            beats: [
              {
                text: '你要真想看，我就挑一张现在的样子给你。',
                intent: 'media',
                relationMove: 'warm',
                sceneMove: 'daily',
                pauseMs: 700,
                assetRequest: {
                  kind: 'image',
                  prompt: 'a realistic portrait',
                },
              },
              {
                text: '别笑我风里来雨里去，发梢总有些乱。',
                intent: 'tease',
                relationMove: 'warm',
                sceneMove: 'daily',
                pauseMs: 650,
              },
            ],
          },
          text: '',
          traceId: 'trace-composer-length-retry',
          promptTraceId: 'trace-composer-length-retry',
          route: {
            source: 'cloud',
            model: 'gemini-2.5-flash',
            provider: 'gemini',
            connectorId: 'connector-1',
            endpoint: '',
            localOpenAiEndpoint: '',
            localProviderEndpoint: '',
            localModelId: '',
            adapter: 'test',
            capability: 'text.generate',
          },
        };
      },
    } as unknown as LocalChatTurnAiClient,
    invokeInput: {
      capability: 'text.generate',
      prompt: 'raw prompt',
      mode: 'STORY',
      agentId: 'agent-1',
    },
    contextPacket: {
      ...createContextPacket(),
      promptLocale: 'zh',
    } as LocalChatContextPacket,
    userText: '我想看看你的照片',
    turnId: 'turn-media-length',
    turnMode: 'explicit-media',
    deliveryStyle: 'natural',
    sealedFirstBeatText: '你若想看，我就让你看看。',
  });

  assert.equal(plan.beats.length, 2);
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.maxTokens, 1800);
  assert.equal(calls[1]?.maxTokens, 2400);
  assert.match(String(calls[1]?.prompt || ''), /长度限制被截断/u);
});

test('tail turn composer strips trailing partial end markers from planned beat text', async () => {
  const plan = await composeInteractionTurnPlan({
    aiClient: {
      generateObject: async () => ({
        object: {
          beats: [
            {
              text: '你这是故意考我呢。|END',
              intent: 'tease',
              relationMove: 'warm',
              sceneMove: '调侃',
              pauseMs: 500,
            },
            {
              text: '我当然还记得你。|EN',
              intent: 'answer',
              relationMove: 'warm',
              sceneMove: '日常',
              pauseMs: 700,
            },
          ],
        },
        text: '',
        traceId: 'trace-tail-partial-marker',
        promptTraceId: 'trace-tail-partial-marker',
        route: {
          source: 'local',
          model: 'model-a',
          provider: 'local',
          connectorId: '',
          endpoint: '',
          localOpenAiEndpoint: '',
          localProviderEndpoint: '',
          localModelId: '',
          adapter: 'test',
          capability: 'text.generate',
        },
      }),
    } as unknown as LocalChatTurnAiClient,
    invokeInput: {
      capability: 'text.generate',
      prompt: 'raw prompt',
      mode: 'STORY',
      agentId: 'agent-1',
    },
    contextPacket: createContextPacket(),
    userText: '你知道我是谁吗',
    turnId: 'turn-partial-marker',
    turnMode: 'emotional',
    deliveryStyle: 'natural',
    sealedFirstBeatText: '我当然知道是你。',
  });

  assert.equal(plan.beats.length, 2);
  assert.equal(plan.beats[0]?.text, '你这是故意考我呢。');
  assert.equal(plan.beats[1]?.text, '我当然还记得你。');
});
