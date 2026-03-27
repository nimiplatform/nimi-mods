import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReferenceImages,
  buildSourcePrompt,
  extractJsonObject,
  generateAgentDraft,
  generateStructuredObject,
  recomputeCurrentBrief,
  runCaptureTurn,
  storeGeneratedArtifact,
} from '../src/services/generation.js';
import {
  normalizeRouteState,
} from '../src/services/route-storage.js';
import {
  resolveAgentCapturePreferredLanguage,
  resolveAgentCapturePromptLocale,
} from '../src/services/language.js';
import {
  isRouteBindingAvailable,
  sanitizeRouteStateAgainstRuntime,
  sanitizeRouteStateAgainstSnapshots,
} from '../src/services/route-validation.js';
import {
  toCreatorAgentSummary,
  toCreatorAgentSummaryList,
} from '../src/services/agent-data.js';
import {
  appendSessionMessage,
  buildSourcePromptFromMessages,
  createEmptyDraftSnapshot,
  createEmptySessionState,
  hasMinimumGenerationInput,
  isDraftFactuallyEmpty,
  sanitizeHydratedSessionState,
} from '../src/services/state.js';
import type { ModRuntimeClient } from '@nimiplatform/sdk/mod';
import type { HookStorageClient, RuntimeRouteBinding } from '@nimiplatform/sdk/mod';
import { z } from 'zod';

test('toCreatorAgentSummary normalizes nested user payload', () => {
  const summary = toCreatorAgentSummary({
    user: {
      id: 'agent-1',
      handle: 'han',
      displayName: 'Han Xin',
      bio: 'A brilliant strategist',
      tags: ['history', 'strategy'],
      agentProfile: {
        worldId: 'w-han',
        activeWorldId: 'w-han',
        importance: 'PRIMARY',
      },
    },
  });
  assert.ok(summary);
  assert.equal(summary?.id, 'agent-1');
  assert.equal(summary?.displayName, 'Han Xin');
  assert.equal(summary?.worldId, 'w-han');
  assert.deepEqual(summary?.tags, ['history', 'strategy']);
});

test('toCreatorAgentSummaryList handles direct arrays and filters invalid items', () => {
  const items = toCreatorAgentSummaryList([
    { id: 'a-1', handle: 'one' },
    { id: '', handle: 'missing' },
    { user: { id: 'a-2', displayName: 'Two' } },
  ]);
  assert.deepEqual(items.map((item) => item.id), ['a-1', 'a-2']);
});

test('extractJsonObject accepts fenced json payloads', () => {
  const parsed = extractJsonObject('```json\n{"brief":"cold and clever"}\n```');
  assert.equal(parsed.brief, 'cold and clever');
});

test('extractJsonObject fails-close on malformed json', () => {
  assert.throws(
    () => extractJsonObject(`{brief:'一个清冷、孤傲的宋代女性', assistantReply:'我会先保留她的清峭感。',}`),
    /AGENT_CAPTURE_JSON_OBJECT_REQUIRED/,
  );
});

test('buildReferenceImages keeps only stable user-provided source image references', () => {
  const snapshot = createEmptyDraftSnapshot();
  snapshot.sourceImage = { url: 'data:image/png;base64,source', mimeType: 'image/png' };
  snapshot.generatedImage = { url: 'data:image/png;base64,current', mimeType: 'image/png' };
  assert.deepEqual(buildReferenceImages(snapshot), ['data:image/png;base64,source']);
});

test('buildReferenceImages does not recursively feed previous generated image bytes back into generation', () => {
  const snapshot = createEmptyDraftSnapshot();
  snapshot.generatedImage = { url: 'data:image/png;base64,current', mimeType: 'image/png' };
  assert.deepEqual(buildReferenceImages(snapshot), []);
});

test('buildSourcePrompt returns the persisted draft source prompt', () => {
  const snapshot = createEmptyDraftSnapshot();
  snapshot.sourcePrompt = '年轻、克制\n更像乱世谋士';
  assert.equal(buildSourcePrompt(snapshot), '年轻、克制\n更像乱世谋士');
});

test('buildSourcePromptFromMessages only uses user messages', () => {
  const session = appendSessionMessage(createEmptySessionState(), {
    role: 'assistant',
    kind: 'chat',
    content: 'Tell me more',
  });
  const next = appendSessionMessage(session, {
    role: 'user',
    kind: 'chat',
    content: '年轻、克制',
  });
  const final = appendSessionMessage(next, {
    role: 'user',
    kind: 'chat',
    content: '更像乱世谋士',
  });
  assert.equal(buildSourcePromptFromMessages(final.messages), '年轻、克制\n更像乱世谋士');
});

test('sanitizeHydratedSessionState decouples restored session from transient working state', () => {
  const restored = sanitizeHydratedSessionState({
    ...createEmptySessionState(),
    messages: [{ id: '1', role: 'user', kind: 'chat', content: '李清照', createdAt: new Date().toISOString() }],
    currentBrief: '宋代词人感',
    pendingBriefConfirmation: true,
    workingState: 'generating',
    surfaceError: 'stale',
    inputMode: 'dialogue',
    lastTextTraceId: 't-1',
    lastImageTraceId: 'i-1',
  });
  assert.equal(restored.messages.length, 1);
  assert.equal(restored.currentBrief, '宋代词人感');
  assert.equal(restored.pendingBriefConfirmation, false);
  assert.equal(restored.workingState, 'idle');
  assert.equal(restored.surfaceError, '');
});

test('empty draft detection and minimum input detection follow fact fields only', () => {
  const snapshot = createEmptyDraftSnapshot();
  assert.equal(isDraftFactuallyEmpty(snapshot), true);
  assert.equal(hasMinimumGenerationInput(snapshot), false);
  snapshot.sourcePrompt = '一个克制的角色';
  assert.equal(isDraftFactuallyEmpty(snapshot), false);
  assert.equal(hasMinimumGenerationInput(snapshot), true);
});

test('normalizeRouteState restores route bindings independently from draft reset semantics', () => {
  const state = normalizeRouteState({
    textRouteBinding: { source: 'local', model: 'qwen-local', localModelId: 'lm-1' },
    imageRouteBinding: { source: 'cloud', connectorId: 'openai', model: 'gpt-image' },
  });
  assert.equal(state.textRouteBinding?.model, 'qwen-local');
  assert.equal(state.imageRouteBinding?.connectorId, 'openai');
});

test('route validation rejects stale route bindings and sanitizes them fail-close', () => {
  const routeState = normalizeRouteState({
    textRouteBinding: { source: 'local', model: 'missing-local', localModelId: 'lm-x' },
    imageRouteBinding: { source: 'cloud', connectorId: 'missing-connector', model: 'gpt-image' },
  });
  const textRouteOptions = {
    capability: 'text.generate' as const,
    local: { models: [{ model: 'qwen-local', localModelId: 'lm-1' }] },
    connectors: [],
    selected: null,
  };
  const imageRouteOptions = {
    capability: 'image.generate' as const,
    local: { models: [] },
    connectors: [{ id: 'openai', label: 'OpenAI', models: ['gpt-image'] }],
    selected: null,
  };
  assert.equal(isRouteBindingAvailable(routeState.textRouteBinding, textRouteOptions), false);
  const sanitized = sanitizeRouteStateAgainstSnapshots({
    routeState,
    textRouteOptions,
    imageRouteOptions,
  });
  assert.equal(sanitized.changed, true);
  assert.equal(sanitized.routeState.textRouteBinding, null);
  assert.equal(sanitized.routeState.imageRouteBinding, null);
});

test('route validation keeps image binding untouched when only text route is being checked', async () => {
  const textBinding: RuntimeRouteBinding = {
    source: 'cloud',
    connectorId: 'text-connector',
    model: 'gemini-3-flash-preview',
  };
  const imageBinding: RuntimeRouteBinding = {
    source: 'cloud',
    connectorId: 'image-connector',
    model: 'gemini-2.5-flash-image',
  };
  const routeState = {
    textRouteBinding: textBinding,
    imageRouteBinding: imageBinding,
  };
  const runtimeClient = {
    route: {
      listOptions: async ({ capability }: { capability: string }) => {
        if (capability !== 'text.generate') {
          throw new Error(`unexpected capability: ${capability}`);
        }
        return {
          capability: 'text.generate',
          local: { models: [] },
          connectors: [{ id: 'text-connector', label: 'Text Connector', models: ['gemini-3-flash-preview'] }],
          selected: textBinding,
        };
      },
    },
  } as unknown as ModRuntimeClient;

  const sanitized = await sanitizeRouteStateAgainstRuntime(runtimeClient, routeState, {
    includeText: true,
    includeImage: false,
  });

  assert.equal(sanitized.changed, false);
  assert.equal(sanitized.routeState.textRouteBinding, textBinding);
  assert.equal(sanitized.routeState.imageRouteBinding, imageBinding);
});

function createRuntimeClientStub(input?: {
  textPayloads?: Array<Record<string, unknown> | string>;
  finishReasons?: string[];
  imageArtifacts?: Array<{ mimeType?: string; bytes?: Uint8Array; uri?: string }>;
  onTextGenerate?: (request: Record<string, unknown>) => void;
  onImageGenerate?: (request: Record<string, unknown>) => void;
}): ModRuntimeClient {
  const payloads = input?.textPayloads ?? [];
  let textCallIndex = 0;
  return {
    route: {
      resolve: async ({ capability }) => ({
        capability,
        model: capability === 'text.generate' ? 'chat-model' : 'image-model',
      }),
    },
    ai: {
      text: {
        generate: async (request) => {
          input?.onTextGenerate?.(request as Record<string, unknown>);
          const currentIndex = textCallIndex;
          const payload = payloads[currentIndex] ?? payloads[payloads.length - 1] ?? {};
          textCallIndex += 1;
          return {
            text: typeof payload === 'string' ? payload : JSON.stringify(payload),
            finishReason: input?.finishReasons?.[currentIndex] || 'stop',
            trace: { traceId: `text-trace-${textCallIndex}` },
          };
        },
      },
    },
    media: {
      image: {
        generate: async (request) => {
          input?.onImageGenerate?.(request as Record<string, unknown>);
          return {
          artifacts: input?.imageArtifacts ?? [{
            mimeType: 'image/png',
            bytes: new Uint8Array([137, 80, 78, 71]),
          }],
          trace: { traceId: 'image-trace-1' },
          };
        },
      },
    },
  } as unknown as ModRuntimeClient;
}

function createStorageClientStub(): HookStorageClient {
  return {
    files: {
      readText: async () => '',
      writeText: async (path, content) => ({ path, sizeBytes: content.length }),
      readBytes: async () => new Uint8Array(),
      writeBytes: async (path, content) => ({ path, sizeBytes: content.length }),
      delete: async () => true,
      list: async () => [],
      stat: async () => null,
    },
    sqlite: {
      query: async () => [],
      execute: async () => ({ rowsAffected: 0, lastInsertRowid: 0 }),
      transaction: async () => ({ rowsAffected: 0, lastInsertRowid: 0 }),
    },
  };
}

test('generateStructuredObject returns a validated object', async () => {
  const result = await generateStructuredObject({
    runtimeClient: createRuntimeClientStub({
      textPayloads: [{ brief: '一个清冷、克制的宋代女性。' }],
    }),
    binding: { source: 'local', model: 'chat-model' } as RuntimeRouteBinding,
    resolveCapability: 'text.generate',
    system: 'system',
    prompt: 'prompt',
    attempts: [{ temperature: 0.1, maxTokens: 256 }],
    schema: z.object({ brief: z.string().min(1) }),
    parseErrorCode: 'PARSE_ERROR',
    truncationErrorCode: 'TRUNCATED',
    contractErrorCode: 'CONTRACT_ERROR',
  });
  assert.equal(result.parsed.brief, '一个清冷、克制的宋代女性。');
  assert.equal(result.traceId, 'text-trace-1');
});

test('generateStructuredObject retries on truncation and then succeeds', async () => {
  const result = await generateStructuredObject({
    runtimeClient: createRuntimeClientStub({
      textPayloads: [
        '{"brief":"一个清冷、克制的宋代女性',
        { brief: '一个清冷、克制的宋代女性。' },
      ],
      finishReasons: ['length', 'stop'],
    }),
    binding: { source: 'local', model: 'chat-model' } as RuntimeRouteBinding,
    resolveCapability: 'text.generate',
    system: 'system',
    prompt: 'prompt',
    attempts: [
      { temperature: 0.1, maxTokens: 256 },
      { temperature: 0.05, maxTokens: 512 },
    ],
    schema: z.object({ brief: z.string().min(1) }),
    parseErrorCode: 'PARSE_ERROR',
    truncationErrorCode: 'TRUNCATED',
    contractErrorCode: 'CONTRACT_ERROR',
  });
  assert.equal(result.parsed.brief, '一个清冷、克制的宋代女性。');
  assert.equal(result.traceId, 'text-trace-2');
});

test('generateStructuredObject fails-close on invalid json', async () => {
  await assert.rejects(
    () => generateStructuredObject({
      runtimeClient: createRuntimeClientStub({
        textPayloads: [`{brief:'broken'}`],
      }),
      binding: { source: 'local', model: 'chat-model' } as RuntimeRouteBinding,
      resolveCapability: 'text.generate',
      system: 'system',
      prompt: 'prompt',
      attempts: [{ temperature: 0.1, maxTokens: 256 }],
      schema: z.object({ brief: z.string().min(1) }),
      parseErrorCode: 'PARSE_ERROR',
      truncationErrorCode: 'TRUNCATED',
      contractErrorCode: 'CONTRACT_ERROR',
    }),
    /PARSE_ERROR/,
  );
});

test('language resolution follows desktop locale and defaults to en for any non-zh desktop locale', () => {
  assert.equal(resolveAgentCapturePromptLocale('zh-CN'), 'zh');
  assert.equal(resolveAgentCapturePromptLocale('en-US'), 'en');
  assert.equal(resolveAgentCapturePromptLocale('ja-JP'), 'en');
  assert.equal(resolveAgentCapturePromptLocale('fr-FR'), 'en');
  assert.equal(resolveAgentCapturePromptLocale(''), 'en');
  assert.equal(resolveAgentCapturePreferredLanguage('en-GB'), 'en-US');
  assert.equal(resolveAgentCapturePreferredLanguage('fr-FR'), 'en-US');
  assert.equal(resolveAgentCapturePreferredLanguage(undefined), 'en-US');
});

test('runCaptureTurn applies Simplified Chinese locale lock by default for zh input', async () => {
  let capturedSystem = '';
  let capturedPrompt = '';
  const draft = createEmptyDraftSnapshot();
  const session = appendSessionMessage(createEmptySessionState(), {
    role: 'user',
    kind: 'chat',
    content: '我想要一个年轻、克制、带书卷气的角色',
  });
  draft.sourcePrompt = buildSourcePromptFromMessages(session.messages);

  const result = await runCaptureTurn({
    runtimeClient: createRuntimeClientStub({
      textPayloads: [{
        assistantReply: '我会先抓住她清峭、克制、书卷感的方向。',
        brief: '一个年轻、克制、带古典书卷气的角色。',
      }],
      onTextGenerate: (request) => {
        capturedSystem = String(request.system || '');
        capturedPrompt = String(request.input || '');
      },
    }),
    draft,
    session,
    selectedAgent: null,
    textBinding: { source: 'local', model: 'chat-model' } as RuntimeRouteBinding,
    userMessage: '更像乱世里的聪明人',
    preferredLanguage: 'zh-CN',
  });
  assert.match(result.assistantReply, /清峭|克制/);
  assert.match(result.brief, /年轻/);
  assert.match(capturedSystem, /使用简体中文输出/);
  assert.match(capturedSystem, /服装、材质、配饰、手持道具、发型、色彩和画风/);
  assert.match(capturedSystem, /背景只作为辅助氛围存在/);
  assert.match(capturedPrompt, /当前角色输入：/);
  assert.doesNotMatch(capturedPrompt, /Current source prompt:/);
});

test('runCaptureTurn uses English prompt shell when preferred language is English', async () => {
  let capturedSystem = '';
  let capturedPrompt = '';
  const draft = createEmptyDraftSnapshot();
  draft.sourcePrompt = 'A restrained scholar with jade ornaments and a scroll.';
  const session = appendSessionMessage(createEmptySessionState(), {
    role: 'user',
    kind: 'chat',
    content: 'She should feel poised and distant.',
  });

  await runCaptureTurn({
    runtimeClient: createRuntimeClientStub({
      textPayloads: [{
        assistantReply: 'Let us lock her robe, ornament, and scroll before adding any more scene detail.',
        brief: 'A poised, distant scholar in a pale robe with jade ornament and scroll.',
      }],
      onTextGenerate: (request) => {
        capturedSystem = String(request.system || '');
        capturedPrompt = String(request.input || '');
      },
    }),
    draft,
    session,
    selectedAgent: null,
    textBinding: { source: 'local', model: 'chat-model' } as RuntimeRouteBinding,
    userMessage: 'Keep the background minimal.',
    preferredLanguage: 'en-US',
  });

  assert.match(capturedSystem, /Reply in English/);
  assert.match(capturedSystem, /outfit, materials, accessories, handheld props, silhouette, palette, and art style/);
  assert.match(capturedPrompt, /Current source prompt:/);
  assert.doesNotMatch(capturedPrompt, /当前角色输入：/);
});

test('runCaptureTurn retries after invalid json output and eventually succeeds', async () => {
  const draft = createEmptyDraftSnapshot();
  const session = appendSessionMessage(createEmptySessionState(), {
    role: 'user',
    kind: 'chat',
    content: '李清照',
  });
  draft.sourcePrompt = buildSourcePromptFromMessages(session.messages);

  const result = await runCaptureTurn({
    runtimeClient: createRuntimeClientStub({
      textPayloads: [
        '{"assistantReply":"坏掉了","brief":"未闭合}',
        {
          assistantReply: '我会先抓住她清峭、书卷、晚年沉郁的感觉。',
          brief: '一位面容清瘦、气质孤高、带宋代书卷与晚年沉郁感的女性。',
        },
      ],
    }),
    draft,
    session,
    selectedAgent: null,
    textBinding: { source: 'local', model: 'chat-model' } as RuntimeRouteBinding,
    userMessage: '李清照',
    preferredLanguage: 'zh-CN',
  });
  assert.match(result.assistantReply, /清峭/);
  assert.match(result.brief, /宋代/);
  assert.equal(result.traceId, 'text-trace-2');
});

test('recomputeCurrentBrief recalculates brief when context changes', async () => {
  const draft = createEmptyDraftSnapshot();
  draft.sourcePrompt = '一个克制、清冷、带书卷气的角色';
  const session = {
    ...createEmptySessionState(),
    currentBrief: '旧 brief',
    messages: [{ id: '1', role: 'user', kind: 'chat', content: '想要一个克制、清冷、带书卷气的角色', createdAt: new Date().toISOString() }],
  };
  const result = await recomputeCurrentBrief({
    runtimeClient: createRuntimeClientStub({
      textPayloads: [{ brief: '一个克制清冷、带古典书卷气的角色。' }],
    }),
    draft,
    session,
    selectedAgent: null,
    textBinding: { source: 'local', model: 'chat-model' } as RuntimeRouteBinding,
    preferredLanguage: 'zh-CN',
  });
  assert.equal(result.brief, '一个克制清冷、带古典书卷气的角色。');
  assert.equal(result.traceId, 'text-trace-1');
});

test('generateAgentDraft uses current context and returns generated image metadata', async () => {
  let capturedSystem = '';
  let capturedPrompt = '';
  let capturedImageRequest: Record<string, unknown> | null = null;
  const draft = createEmptyDraftSnapshot();
  draft.sourcePrompt = '年轻、克制、更像乱世谋士';
  draft.sourceImage = {
    url: 'data:image/png;base64,source',
    mimeType: 'image/png',
    fileName: 'source.png',
  };
  draft.generatedImage = {
    url: 'data:image/png;base64,current',
    mimeType: 'image/png',
  };
  const session = {
    ...createEmptySessionState(),
    currentBrief: '一个年轻、克制、偏古典书卷气的角色。',
  };

  const result = await generateAgentDraft({
    storage: createStorageClientStub(),
    runtimeClient: createRuntimeClientStub({
      textPayloads: [{
        name: '乱世谋士',
        bio: '一个在动荡时代仍然保持冷静与克制的年轻谋士。',
        personaSeed: '年轻，克制，聪明，带书卷气，不轻易显露情绪。',
        tags: ['young', 'strategist', 'restrained'],
        characterReadout: '这版更像一个年轻但不轻浮、克制却很清醒的谋士。',
        imagePrompt: 'full-body character anchor image of a young restrained strategist in ancient east asia, stable pose, weak background',
        negativePrompt: 'modern clothes, neon, cartoon',
      }],
      onTextGenerate: (request) => {
        capturedSystem = String(request.system || '');
        capturedPrompt = String(request.input || '');
      },
      onImageGenerate: (request) => {
        capturedImageRequest = request;
      },
    }),
    draft,
    session,
    selectedAgent: null,
    textBinding: { source: 'local', model: 'chat-model' } as RuntimeRouteBinding,
    imageBinding: { source: 'cloud', connectorId: 'openai', model: 'gpt-image' } as RuntimeRouteBinding,
    preferredLanguage: 'zh-CN',
  });
  assert.equal(result.draft.name, '乱世谋士');
  assert.deepEqual(result.draft.tags, ['young', 'strategist', 'restrained']);
  assert.match(result.draft.characterReadout, /谋士/);
  assert.match(result.image.url, /^data:image\/png;base64,/);
  assert.equal(result.textTraceId, 'text-trace-1');
  assert.equal(result.imageTraceId, 'image-trace-1');
  assert.match(capturedSystem, /使用简体中文输出/);
  assert.match(capturedSystem, /固定焦距人物视角/);
  assert.match(capturedSystem, /服装、材质、配饰、手持道具、色彩与画风/);
  assert.match(capturedSystem, /背景退后、弱化、低细节/);
  assert.match(capturedSystem, /不要机械继承上一版图中的脏污、模糊、噪点|Do not mechanically inherit incidental dirt, blur, noise/);
  assert.match(capturedPrompt, /当前已经存在一张生成图，应被视为本轮方向反馈的一部分|A current generated image already exists and should be treated as directional feedback/);
  assert.equal(capturedImageRequest?.timeoutMs, 600000);
  assert.equal(capturedImageRequest?.size, '1024x1024');
  assert.equal(capturedImageRequest?.quality, 'medium');
  assert.equal(capturedImageRequest?.responseFormat, 'url');
  assert.deepEqual(capturedImageRequest?.referenceImages, ['data:image/png;base64,source']);
  assert.match(String(capturedImageRequest?.prompt || ''), /Full-body character anchor image|全身角色锚点图/);
  assert.match(String(capturedImageRequest?.prompt || ''), /配饰、手持道具与画风明确/);
  assert.match(String(capturedImageRequest?.prompt || ''), /平视或接近平视/);
  assert.match(String(capturedImageRequest?.negativePrompt || ''), /half-body portrait|半身像/);
  assert.match(String(capturedImageRequest?.negativePrompt || ''), /cropped feet|脚部裁切/);
  assert.match(String(capturedImageRequest?.negativePrompt || ''), /俯拍|high-angle shot/);
});

test('storeGeneratedArtifact preserves remote url artifacts without re-encoding them through local storage', async () => {
  const storage = createStorageClientStub();
  const image = await storeGeneratedArtifact({
    storage,
    draftId: 'draft-1',
    artifact: {
      uri: 'https://example.com/generated.png',
      mimeType: 'image/png',
    },
  });

  assert.ok(image);
  assert.equal(image?.path, undefined);
  assert.equal(image?.url, 'https://example.com/generated.png');
});
