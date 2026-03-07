import type { Dispatch, SetStateAction } from 'react';
import type { ChatMessage } from '../../types.js';
import type {
  LocalChatDefaultSettings,
  LocalChatPromptTrace,
  LocalChatSession,
  LocalChatTurnAudit,
} from '../../state/index.js';
import {
  getLocalChatCachedMediaAsset,
  putLocalChatCachedMediaAsset,
} from '../../state/index.js';
import type { MediaExecutionDecision, MediaPromptTracePatch, MediaRouteSource } from './media-decision-types.js';
import { runImageTurn } from './image-turn-runner.js';
import { runVideoTurn } from './video-turn-runner.js';
import {
  createMediaBlockedMessage,
  createMediaFailureMessage,
  createPendingMediaMessage,
  createReadyMediaMessage,
} from './media-message-factory.js';
import {
  buildMediaArtifactShadow,
  createMediaExecutionCacheKey,
} from './media-spec.js';
import { commitAssistantMessage } from './session-persist.js';
import type { LocalChatTurnAiClient } from './types.js';

export type ExecuteMediaDecisionInput = {
  decision: MediaExecutionDecision;
  aiClient: LocalChatTurnAiClient;
  defaultSettings: LocalChatDefaultSettings;
  nsfwPolicy: 'disabled' | 'local-runtime-only' | 'allowed';
  fallbackRouteSource: MediaRouteSource;
  sessionId: string;
  targetId: string;
  viewerId: string;
  assistantBundleId: string;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setSessions: (sessions: LocalChatSession[]) => void;
  promptTrace?: LocalChatPromptTrace | null;
  turnAudit?: LocalChatTurnAudit | null;
  sendContextKey: string;
  getCurrentContextKey: () => string;
};

function createExecutionTracePatch(input: {
  status: 'ready' | 'failed' | 'blocked';
  routeSource?: MediaRouteSource | null;
  routeModel?: string | null;
  reason?: string | null;
  specHash?: string | null;
  compilerRevision?: string | null;
  resolvedBy?: MediaPromptTracePatch['mediaRouteResolvedBy'];
  cacheStatus?: MediaPromptTracePatch['mediaCacheStatus'];
  shadowText?: string | null;
}): Partial<MediaPromptTracePatch> {
  return {
    mediaExecutionStatus: input.status,
    mediaExecutionRouteSource: input.routeSource || null,
    mediaExecutionRouteModel: input.routeModel || null,
    mediaExecutionReason: input.reason || null,
    mediaSpecHash: input.specHash || null,
    mediaCompilerRevision: input.compilerRevision || null,
    mediaRouteResolvedBy: input.resolvedBy || null,
    mediaCacheStatus: input.cacheStatus || null,
    mediaShadowText: input.shadowText || null,
  };
}

export async function executeMediaDecision(input: ExecuteMediaDecisionInput): Promise<Partial<MediaPromptTracePatch> | null> {
  if (input.decision.kind === 'none') {
    return null;
  }

  if (input.decision.kind === 'blocked') {
    const shadow = buildMediaArtifactShadow({
      spec: input.decision.prepared.spec,
      status: 'blocked',
      routeSource: input.decision.routeSource,
      routeModel: input.decision.resolvedRoute?.model || null,
      assetOrigin: 'generated',
      reason: input.decision.blockedReason,
    });
    await commitAssistantMessage({
      sessionId: input.sessionId,
      targetId: input.targetId,
      viewerId: input.viewerId,
      assistantBundleId: input.assistantBundleId,
      messageId: input.decision.intent.pendingMessageId,
      setMessages: input.setMessages,
      setSessions: input.setSessions,
      promptTrace: input.promptTrace,
      turnAudit: input.turnAudit,
      message: createMediaBlockedMessage({
        intent: input.decision.intent,
        prepared: input.decision.prepared,
        reason: input.decision.blockedReason,
        routeSource: input.decision.routeSource,
        resolvedRoute: input.decision.resolvedRoute,
        shadow,
      }),
    });
    return createExecutionTracePatch({
      status: 'blocked',
      routeSource: input.decision.routeSource,
      routeModel: input.decision.resolvedRoute?.model || null,
      reason: input.decision.blockedReason,
      specHash: input.decision.prepared.specHash,
      compilerRevision: input.decision.prepared.compiled.compilerRevision,
      resolvedBy: input.decision.resolvedRoute?.resolvedBy || null,
      cacheStatus: 'none',
      shadowText: shadow.shadowText,
    });
  }

  const { prepared, intent, resolvedRoute } = input.decision;
  const executionCacheKey = await createMediaExecutionCacheKey({
    specHash: prepared.specHash,
    compiled: prepared.compiled,
    spec: prepared.spec,
    resolvedRoute,
    nsfwPolicy: input.nsfwPolicy,
  });
  const cached = await getLocalChatCachedMediaAsset(executionCacheKey);
  if (cached) {
    const shadow = buildMediaArtifactShadow({
      spec: prepared.spec,
      status: 'ready',
      routeSource: cached.routeSource,
      routeModel: cached.model || resolvedRoute.model || null,
      assetOrigin: 'cache-hit',
    });
    await commitAssistantMessage({
      sessionId: input.sessionId,
      targetId: input.targetId,
      viewerId: input.viewerId,
      assistantBundleId: input.assistantBundleId,
      messageId: intent.pendingMessageId,
      setMessages: input.setMessages,
      setSessions: input.setSessions,
      promptTrace: input.promptTrace,
      turnAudit: input.turnAudit,
      message: createReadyMediaMessage({
        intent,
        prepared,
        uri: cached.renderUri,
        mimeType: cached.mimeType,
        routeSource: cached.routeSource,
        routeModel: cached.model || resolvedRoute.model,
        resolvedRoute,
        shadow,
        cacheStatus: 'hit',
        executionCacheKey,
        nsfwPolicy: input.nsfwPolicy,
      }),
    });
    return createExecutionTracePatch({
      status: 'ready',
      routeSource: cached.routeSource,
      routeModel: cached.model || resolvedRoute.model || null,
      specHash: prepared.specHash,
      compilerRevision: prepared.compiled.compilerRevision,
      resolvedBy: resolvedRoute.resolvedBy,
      cacheStatus: 'hit',
      shadowText: shadow.shadowText,
    });
  }

  input.setMessages((prev) => [...prev, createPendingMediaMessage({
    intent,
    prepared,
    resolvedRoute,
  })]);

  if (prepared.spec.kind === 'image') {
    const result = await runImageTurn({
      aiClient: input.aiClient,
      prompt: prepared.compiled.runtimePayload.prompt,
      defaultSettings: input.defaultSettings,
      nsfwPolicy: input.nsfwPolicy,
      fallbackRouteSource: input.fallbackRouteSource,
      resolvedRoute,
      negativePrompt: prepared.compiled.runtimePayload.negativePrompt,
      size: prepared.compiled.runtimePayload.size,
      aspectRatio: prepared.compiled.runtimePayload.aspectRatio,
      quality: prepared.compiled.runtimePayload.quality,
      style: prepared.compiled.runtimePayload.style,
      count: prepared.compiled.runtimePayload.n,
    });
    if (input.getCurrentContextKey() !== input.sendContextKey) {
      input.setMessages((prev) => prev.filter((message) => message.id !== intent.pendingMessageId));
      return null;
    }
    if (result.status === 'ok') {
      const createdAt = new Date().toISOString();
      await putLocalChatCachedMediaAsset({
        executionCacheKey,
        specHash: prepared.specHash,
        kind: 'image',
        renderUri: result.uri,
        mimeType: result.mimeType,
        routeSource: result.routeSource,
        ...(resolvedRoute.connectorId ? { connectorId: resolvedRoute.connectorId } : {}),
        ...(result.routeModel || resolvedRoute.model ? { model: result.routeModel || resolvedRoute.model } : {}),
        createdAt,
        lastHitAt: createdAt,
      });
      const shadow = buildMediaArtifactShadow({
        spec: prepared.spec,
        status: 'ready',
        routeSource: result.routeSource,
        routeModel: result.routeModel || resolvedRoute.model || null,
        assetOrigin: 'generated',
      });
      await commitAssistantMessage({
        sessionId: input.sessionId,
        targetId: input.targetId,
        viewerId: input.viewerId,
        assistantBundleId: input.assistantBundleId,
        messageId: intent.pendingMessageId,
        setMessages: input.setMessages,
        setSessions: input.setSessions,
        promptTrace: input.promptTrace,
        turnAudit: input.turnAudit,
        message: createReadyMediaMessage({
          intent,
          prepared,
          uri: result.uri,
          mimeType: result.mimeType,
          routeSource: result.routeSource,
          routeModel: result.routeModel,
          resolvedRoute,
          shadow,
          cacheStatus: 'miss',
          executionCacheKey,
          nsfwPolicy: input.nsfwPolicy,
        }),
      });
      return createExecutionTracePatch({
        status: 'ready',
        routeSource: result.routeSource,
        routeModel: result.routeModel || resolvedRoute.model || null,
        specHash: prepared.specHash,
        compilerRevision: prepared.compiled.compilerRevision,
        resolvedBy: resolvedRoute.resolvedBy,
        cacheStatus: 'miss',
        shadowText: shadow.shadowText,
      });
    }
    if (result.status === 'blocked') {
      const shadow = buildMediaArtifactShadow({
        spec: prepared.spec,
        status: 'blocked',
        routeSource: result.routeSource,
        routeModel: resolvedRoute.model || null,
        assetOrigin: 'generated',
        reason: result.message,
      });
      await commitAssistantMessage({
        sessionId: input.sessionId,
        targetId: input.targetId,
        viewerId: input.viewerId,
        assistantBundleId: input.assistantBundleId,
        messageId: intent.pendingMessageId,
        setMessages: input.setMessages,
        setSessions: input.setSessions,
        promptTrace: input.promptTrace,
        turnAudit: input.turnAudit,
        message: createMediaBlockedMessage({
          intent,
          prepared,
          reason: result.message,
          routeSource: result.routeSource,
          resolvedRoute,
          shadow,
          executionCacheKey,
        }),
      });
      return createExecutionTracePatch({
        status: 'blocked',
        routeSource: result.routeSource,
        routeModel: resolvedRoute.model || null,
        reason: result.message,
        specHash: prepared.specHash,
        compilerRevision: prepared.compiled.compilerRevision,
        resolvedBy: resolvedRoute.resolvedBy,
        cacheStatus: 'miss',
        shadowText: shadow.shadowText,
      });
    }
    const shadow = buildMediaArtifactShadow({
      spec: prepared.spec,
      status: 'failed',
      routeSource: result.routeSource || resolvedRoute.source,
      routeModel: resolvedRoute.model || null,
      assetOrigin: 'generated',
      reason: result.message,
    });
    await commitAssistantMessage({
      sessionId: input.sessionId,
      targetId: input.targetId,
      viewerId: input.viewerId,
      assistantBundleId: input.assistantBundleId,
      messageId: intent.pendingMessageId,
      setMessages: input.setMessages,
      setSessions: input.setSessions,
      promptTrace: input.promptTrace,
      turnAudit: input.turnAudit,
      message: createMediaFailureMessage({
        intent,
        prepared,
        reason: result.message,
        routeSource: result.routeSource,
        resolvedRoute,
        shadow,
        executionCacheKey,
      }),
    });
    return createExecutionTracePatch({
      status: 'failed',
      routeSource: result.routeSource || resolvedRoute.source,
      routeModel: resolvedRoute.model || null,
      reason: result.message,
      specHash: prepared.specHash,
      compilerRevision: prepared.compiled.compilerRevision,
      resolvedBy: resolvedRoute.resolvedBy,
      cacheStatus: 'miss',
      shadowText: shadow.shadowText,
    });
  }

    const result = await runVideoTurn({
      aiClient: input.aiClient,
      prompt: prepared.compiled.runtimePayload.prompt,
      defaultSettings: input.defaultSettings,
      nsfwPolicy: input.nsfwPolicy,
      fallbackRouteSource: input.fallbackRouteSource,
      resolvedRoute,
      negativePrompt: prepared.compiled.runtimePayload.negativePrompt,
      durationSeconds: prepared.compiled.runtimePayload.durationSeconds,
      aspectRatio: prepared.compiled.runtimePayload.aspectRatio,
      cameraMotion: prepared.compiled.runtimePayload.cameraMotion,
    });
  if (input.getCurrentContextKey() !== input.sendContextKey) {
    input.setMessages((prev) => prev.filter((message) => message.id !== intent.pendingMessageId));
    return null;
  }
  if (result.status === 'ok') {
    const createdAt = new Date().toISOString();
    await putLocalChatCachedMediaAsset({
      executionCacheKey,
      specHash: prepared.specHash,
      kind: 'video',
      renderUri: result.uri,
      mimeType: result.mimeType,
      routeSource: result.routeSource,
      ...(resolvedRoute.connectorId ? { connectorId: resolvedRoute.connectorId } : {}),
      ...(result.routeModel || resolvedRoute.model ? { model: result.routeModel || resolvedRoute.model } : {}),
      createdAt,
      lastHitAt: createdAt,
    });
    const shadow = buildMediaArtifactShadow({
      spec: prepared.spec,
      status: 'ready',
      routeSource: result.routeSource,
      routeModel: result.routeModel || resolvedRoute.model || null,
      assetOrigin: 'generated',
    });
    await commitAssistantMessage({
      sessionId: input.sessionId,
      targetId: input.targetId,
      viewerId: input.viewerId,
      assistantBundleId: input.assistantBundleId,
      messageId: intent.pendingMessageId,
      setMessages: input.setMessages,
      setSessions: input.setSessions,
      promptTrace: input.promptTrace,
      turnAudit: input.turnAudit,
      message: createReadyMediaMessage({
        intent,
        prepared,
        uri: result.uri,
        mimeType: result.mimeType,
        routeSource: result.routeSource,
        routeModel: result.routeModel,
        resolvedRoute,
        shadow,
        cacheStatus: 'miss',
        executionCacheKey,
        nsfwPolicy: input.nsfwPolicy,
      }),
    });
    return createExecutionTracePatch({
      status: 'ready',
      routeSource: result.routeSource,
      routeModel: result.routeModel || resolvedRoute.model || null,
      specHash: prepared.specHash,
      compilerRevision: prepared.compiled.compilerRevision,
      resolvedBy: resolvedRoute.resolvedBy,
      cacheStatus: 'miss',
      shadowText: shadow.shadowText,
    });
  }
  if (result.status === 'blocked') {
    const shadow = buildMediaArtifactShadow({
      spec: prepared.spec,
      status: 'blocked',
      routeSource: result.routeSource,
      routeModel: resolvedRoute.model || null,
      assetOrigin: 'generated',
      reason: result.message,
    });
    await commitAssistantMessage({
      sessionId: input.sessionId,
      targetId: input.targetId,
      viewerId: input.viewerId,
      assistantBundleId: input.assistantBundleId,
      messageId: intent.pendingMessageId,
      setMessages: input.setMessages,
      setSessions: input.setSessions,
      promptTrace: input.promptTrace,
      turnAudit: input.turnAudit,
      message: createMediaBlockedMessage({
        intent,
        prepared,
        reason: result.message,
        routeSource: result.routeSource,
        resolvedRoute,
        shadow,
        executionCacheKey,
      }),
    });
    return createExecutionTracePatch({
      status: 'blocked',
      routeSource: result.routeSource,
      routeModel: resolvedRoute.model || null,
      reason: result.message,
      specHash: prepared.specHash,
      compilerRevision: prepared.compiled.compilerRevision,
      resolvedBy: resolvedRoute.resolvedBy,
      cacheStatus: 'miss',
      shadowText: shadow.shadowText,
    });
  }
  const shadow = buildMediaArtifactShadow({
    spec: prepared.spec,
    status: 'failed',
    routeSource: result.routeSource || resolvedRoute.source,
    routeModel: resolvedRoute.model || null,
    assetOrigin: 'generated',
    reason: result.message,
  });
  await commitAssistantMessage({
    sessionId: input.sessionId,
    targetId: input.targetId,
    viewerId: input.viewerId,
    assistantBundleId: input.assistantBundleId,
    messageId: intent.pendingMessageId,
    setMessages: input.setMessages,
    setSessions: input.setSessions,
    promptTrace: input.promptTrace,
    turnAudit: input.turnAudit,
    message: createMediaFailureMessage({
      intent,
      prepared,
      reason: result.message,
      routeSource: result.routeSource,
      resolvedRoute,
      shadow,
      executionCacheKey,
    }),
  });
  return createExecutionTracePatch({
    status: 'failed',
    routeSource: result.routeSource || resolvedRoute.source,
    routeModel: resolvedRoute.model || null,
    reason: result.message,
    specHash: prepared.specHash,
    compilerRevision: prepared.compiled.compilerRevision,
    resolvedBy: resolvedRoute.resolvedBy,
    cacheStatus: 'miss',
    shadowText: shadow.shadowText,
  });
}
