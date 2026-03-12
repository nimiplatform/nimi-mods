import type { Dispatch, SetStateAction } from 'react';
import { emitLocalChatLog } from '../../logging.js';
import type { ChatMessage } from '../../types.js';
import type {
  LocalChatDefaultSettings,
  LocalChatPromptTrace,
  LocalChatSession,
  LocalChatTurnAudit,
} from '../../state/index.js';
import type { LocalChatTarget } from '../../data/index.js';
import { resolveLocalChatTargetReferenceImageUrl } from '../../data/index.js';
import {
  getLocalChatCachedMediaAsset,
  putLocalChatCachedMediaAsset,
  upsertLocalChatMediaAssetRecord,
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
  nsfwPolicy: 'disabled' | 'local-only' | 'allowed';
  fallbackRouteSource: MediaRouteSource;
  sessionId: string;
  target: LocalChatTarget;
  targetId: string;
  viewerId: string;
  assistantTurnId: string;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setSessions: (sessions: LocalChatSession[]) => void;
  promptTrace?: LocalChatPromptTrace | null;
  turnAudit?: LocalChatTurnAudit | null;
  messageMeta?: ChatMessage['meta'];
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
  async function recordDeliveredMediaAsset(asset: {
    beatId: string;
    executionCacheKey: string;
    specHash: string;
    kind: 'image' | 'video';
    renderUri: string;
    mimeType: string;
    routeSource: MediaRouteSource;
    connectorId?: string;
    model?: string;
    createdAt: string;
    lastHitAt: string;
  }): Promise<void> {
    await upsertLocalChatMediaAssetRecord({
      id: `media_${asset.beatId}`,
      executionCacheKey: asset.executionCacheKey,
      specHash: asset.specHash,
      kind: asset.kind,
      renderUri: asset.renderUri,
      mimeType: asset.mimeType,
      routeSource: asset.routeSource,
      ...(asset.connectorId ? { connectorId: asset.connectorId } : {}),
      ...(asset.model ? { model: asset.model } : {}),
      createdAt: asset.createdAt,
      lastHitAt: asset.lastHitAt,
      conversationId: input.sessionId,
      turnId: input.assistantTurnId,
      beatId: asset.beatId,
    });
  }

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
      assistantTurnId: input.assistantTurnId,
      messageId: input.decision.intent.pendingMessageId,
      setMessages: input.setMessages,
      setSessions: input.setSessions,
      promptTrace: input.promptTrace,
      turnAudit: input.turnAudit,
      message: createMediaBlockedMessage({
        intent: input.decision.intent,
        prepared: input.decision.prepared,
        messageMeta: input.messageMeta,
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
  const referenceImageUrl = resolveLocalChatTargetReferenceImageUrl(input.target);
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
      assistantTurnId: input.assistantTurnId,
      messageId: intent.pendingMessageId,
      setMessages: input.setMessages,
      setSessions: input.setSessions,
      promptTrace: input.promptTrace,
      turnAudit: input.turnAudit,
      message: createReadyMediaMessage({
        intent,
        prepared,
        messageMeta: input.messageMeta,
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
    await recordDeliveredMediaAsset({
      beatId: intent.pendingMessageId,
      executionCacheKey,
      specHash: prepared.specHash,
      kind: prepared.spec.kind,
      renderUri: cached.renderUri,
      mimeType: cached.mimeType,
      routeSource: cached.routeSource,
      connectorId: cached.connectorId,
      model: cached.model || resolvedRoute.model,
      createdAt: cached.createdAt,
      lastHitAt: new Date().toISOString(),
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
    messageMeta: input.messageMeta,
    resolvedRoute,
  })]);

  emitLocalChatLog({
    level: 'info',
    message: 'local-chat:media-execution:start',
    details: {
      pendingMessageId: intent.pendingMessageId,
      mediaKind: prepared.spec.kind,
      intentSource: intent.source,
      plannerTrigger: intent.plannerTrigger,
      routeSource: resolvedRoute.source,
      routeModel: resolvedRoute.model,
      localModelId: resolvedRoute.localModelId || '',
      compiledModel: prepared.compiled.runtimePayload.model || '',
    },
  });

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
      referenceImages: referenceImageUrl ? [referenceImageUrl] : undefined,
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
        assistantTurnId: input.assistantTurnId,
        messageId: intent.pendingMessageId,
        setMessages: input.setMessages,
        setSessions: input.setSessions,
        promptTrace: input.promptTrace,
        turnAudit: input.turnAudit,
        message: createReadyMediaMessage({
          intent,
          prepared,
          messageMeta: input.messageMeta,
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
      await recordDeliveredMediaAsset({
        beatId: intent.pendingMessageId,
        executionCacheKey,
        specHash: prepared.specHash,
        kind: 'image',
        renderUri: result.uri,
        mimeType: result.mimeType,
        routeSource: result.routeSource,
        connectorId: resolvedRoute.connectorId,
        model: result.routeModel || resolvedRoute.model,
        createdAt,
        lastHitAt: createdAt,
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
        assistantTurnId: input.assistantTurnId,
        messageId: intent.pendingMessageId,
        setMessages: input.setMessages,
        setSessions: input.setSessions,
        promptTrace: input.promptTrace,
        turnAudit: input.turnAudit,
        message: createMediaBlockedMessage({
          intent,
          prepared,
          messageMeta: input.messageMeta,
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
      assistantTurnId: input.assistantTurnId,
      messageId: intent.pendingMessageId,
      setMessages: input.setMessages,
      setSessions: input.setSessions,
      promptTrace: input.promptTrace,
      turnAudit: input.turnAudit,
      message: createMediaFailureMessage({
        intent,
        prepared,
        messageMeta: input.messageMeta,
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
      referenceImageUrl,
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
      assistantTurnId: input.assistantTurnId,
      messageId: intent.pendingMessageId,
      setMessages: input.setMessages,
      setSessions: input.setSessions,
      promptTrace: input.promptTrace,
      turnAudit: input.turnAudit,
      message: createReadyMediaMessage({
        intent,
        prepared,
        messageMeta: input.messageMeta,
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
    await recordDeliveredMediaAsset({
      beatId: intent.pendingMessageId,
      executionCacheKey,
      specHash: prepared.specHash,
      kind: 'video',
      renderUri: result.uri,
      mimeType: result.mimeType,
      routeSource: result.routeSource,
      connectorId: resolvedRoute.connectorId,
      model: result.routeModel || resolvedRoute.model,
      createdAt,
      lastHitAt: createdAt,
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
      assistantTurnId: input.assistantTurnId,
      messageId: intent.pendingMessageId,
      setMessages: input.setMessages,
      setSessions: input.setSessions,
      promptTrace: input.promptTrace,
      turnAudit: input.turnAudit,
      message: createMediaBlockedMessage({
        intent,
        prepared,
        messageMeta: input.messageMeta,
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
    assistantTurnId: input.assistantTurnId,
    messageId: intent.pendingMessageId,
    setMessages: input.setMessages,
    setSessions: input.setSessions,
    promptTrace: input.promptTrace,
    turnAudit: input.turnAudit,
    message: createMediaFailureMessage({
      intent,
      prepared,
      messageMeta: input.messageMeta,
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
