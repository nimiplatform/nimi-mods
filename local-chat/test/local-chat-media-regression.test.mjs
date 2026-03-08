import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS } from '../src/state/index.ts';
import { decideMediaExecution } from '../src/hooks/turn-send/media-decision-policy.ts';
import { buildMediaGenerationSpec, compileMediaExecution } from '../src/hooks/turn-send/media-spec.ts';
import {
  createMediaDecisionTarget,
  createMediaDependencySnapshot,
  mediaDecisionRegressionCases,
  mediaSpecRegressionCases,
} from './fixtures/media-regression-fixtures.mjs';

function createResolvedRoute(input = {}) {
  const routeSource = input.source === 'cloud' ? 'cloud' : 'local';
  return {
    source: routeSource,
    ...(routeSource === 'cloud' ? { connectorId: String(input.connectorId || 'connector.media').trim() } : {}),
    model: String(input.model || (routeSource === 'cloud' ? 'media-cloud-model' : 'media-local-model')).trim(),
    provider: String(input.provider || (routeSource === 'cloud' ? 'openai-compatible' : 'localai')).trim(),
    resolvedBy: 'preflight',
    resolvedAt: new Date().toISOString(),
    settingsRevision: 'regression-test',
    routeOptionsRevision: 1,
  };
}

function createChatMessage(shorthand, index) {
  const ageMinutes = Number.isFinite(shorthand.ageMinutes) ? Number(shorthand.ageMinutes) : 1;
  return {
    id: String(shorthand.id || `msg-${index + 1}`),
    role: shorthand.role || 'assistant',
    kind: shorthand.kind || 'text',
    content: String(shorthand.content || ''),
    timestamp: new Date(Date.now() - (ageMinutes * 60_000)),
    meta: shorthand.meta || undefined,
  };
}

function createDecisionAiClient(fixture) {
  return {
    generateObject: async () => {
      if (!fixture.plannerDecision) {
        throw new Error('planner should not run for this regression case');
      }
      return {
        object: fixture.plannerDecision,
        text: JSON.stringify(fixture.plannerDecision),
        traceId: `trace-${fixture.name}`,
        promptTraceId: `trace-${fixture.name}`,
        route: {
          source: fixture.routeSource === 'cloud' ? 'cloud' : 'local',
          connectorId: fixture.routeSource === 'cloud' ? 'connector.media' : undefined,
          model: fixture.routeSource === 'cloud' ? 'planner-cloud-model' : 'planner-local-model',
        },
      };
    },
    resolveRoute: async () => createResolvedRoute({
      source: fixture.routeSource,
    }),
  };
}

function createDecisionSettings(fixture) {
  return {
    ...DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS,
    imageRouteSource: fixture.routeSource === 'cloud' ? 'cloud' : 'local',
    videoRouteSource: fixture.routeSource === 'cloud' ? 'cloud' : 'local',
    imageConnectorId: fixture.routeSource === 'cloud' ? 'connector.media' : '',
    videoConnectorId: fixture.routeSource === 'cloud' ? 'connector.media' : '',
  };
}

function createResolvedPolicy(settings, fixture) {
  return {
    deliveryPolicy: {
      style: settings.deliveryStyle,
      allowMultiReply: settings.deliveryStyle === 'natural',
    },
    voicePolicy: {
      enabled: settings.enableVoice,
      conversationMode: settings.voiceConversationMode,
      autoPlayReplies: settings.autoPlayVoiceReplies,
      selectedVoiceId: settings.voiceName || null,
      selectionMode: settings.voiceName ? 'manual' : 'auto',
    },
    mediaPolicy: {
      autonomy: settings.mediaAutonomy,
      visualComfortLevel: settings.visualComfortLevel,
      routeSource: fixture.routeSource === 'cloud' ? 'cloud' : 'local',
      nsfwPolicy: fixture.nsfwPolicy || 'disabled',
      allowVisualAuto: settings.mediaAutonomy === 'natural' && settings.visualComfortLevel !== 'text-only',
      allowAutoVisualHighRisk: false,
    },
    contentBoundary: {
      relationshipBoundaryPreset: settings.relationshipBoundaryPreset,
      visualComfortLevel: settings.visualComfortLevel,
      routeSource: fixture.routeSource === 'cloud' ? 'cloud' : 'local',
      relationshipState: 'new',
    },
    inspectFlags: {
      diagnosticsVisible: true,
      runtimeInspectorVisible: false,
    },
  };
}

for (const fixture of mediaDecisionRegressionCases) {
  test(`media regression: ${fixture.name}`, async () => {
    const settings = createDecisionSettings(fixture);
    const result = await decideMediaExecution({
      aiClient: createDecisionAiClient(fixture),
      turnTxnId: `txn-${fixture.name.replace(/\s+/g, '-').toLowerCase()}`,
      routeBinding: null,
      defaultSettings: settings,
      resolvedPolicy: createResolvedPolicy(settings, fixture),
      userText: fixture.userText,
      assistantText: fixture.assistantText,
      target: createMediaDecisionTarget(),
      worldId: 'world.media-regression',
      messages: Array.isArray(fixture.messages)
        ? fixture.messages.map(createChatMessage)
        : [],
      promptTrace: null,
      nsfwPolicy: fixture.nsfwPolicy || 'allowed',
      fallbackRouteSource: fixture.routeSource === 'cloud' ? 'cloud' : 'local',
      imageDependencySnapshot: fixture.imageDependencyStatus
        ? createMediaDependencySnapshot('image', fixture.imageDependencyStatus)
        : createMediaDependencySnapshot('image', 'ready'),
      videoDependencySnapshot: fixture.videoDependencyStatus
        ? createMediaDependencySnapshot('video', fixture.videoDependencyStatus)
        : createMediaDependencySnapshot('video', 'ready'),
      markerOverrideIntent: null,
    });

    assert.equal(result.kind, fixture.expected.kind);
    if (fixture.expected.plannerBlockedReason) {
      assert.equal(result.promptTracePatch.plannerBlockedReason, fixture.expected.plannerBlockedReason);
    }
    if (fixture.expected.kind !== 'execute') {
      return;
    }

    assert.equal(result.intent.type, fixture.expected.intentType);
    assert.equal(result.resolvedRoute.source, fixture.expected.routeSource);
    if (fixture.expected.requestedSize) {
      assert.equal(result.prepared.spec.requestedSize, fixture.expected.requestedSize);
    }
    if (fixture.expected.requestedDurationSeconds) {
      assert.equal(result.prepared.spec.requestedDurationSeconds, fixture.expected.requestedDurationSeconds);
    }
  });
}

for (const fixture of mediaSpecRegressionCases) {
  test(`media spec regression: ${fixture.name}`, () => {
    const spec = buildMediaGenerationSpec({
      intent: fixture.intent,
      targetId: 'agent.local-chat.media-regression',
      worldId: 'world.media-regression',
    });
    const compiled = compileMediaExecution(spec);

    if (fixture.expected.requestedSize) {
      assert.equal(spec.requestedSize, fixture.expected.requestedSize);
    }
    if (fixture.expected.requestedDurationSeconds) {
      assert.equal(spec.requestedDurationSeconds, fixture.expected.requestedDurationSeconds);
    }
    for (const [field, expectedValue] of Object.entries(fixture.expected.runtimePayload || {})) {
      assert.deepEqual(compiled.runtimePayload[field], expectedValue);
    }
  });
}
