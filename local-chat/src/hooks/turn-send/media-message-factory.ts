import type { ChatMessage } from '../../types.js';
import type {
  MediaExecutionStatus,
  PendingMediaIntent,
  PreparedMediaExecution,
  MediaRouteSource,
} from './media-decision-types.js';
import type { LocalChatMediaArtifactShadow, LocalChatResolvedMediaRoute } from '../../types.js';

function createBaseMediaMeta(input: {
  intent: PendingMediaIntent;
  prepared?: PreparedMediaExecution;
  status: Extract<MediaExecutionStatus, 'pending' | 'ready' | 'failed' | 'blocked'>;
  routeSource?: MediaRouteSource;
  routeModel?: string;
  resolvedRoute?: LocalChatResolvedMediaRoute | null;
  shadow?: LocalChatMediaArtifactShadow;
  cacheStatus?: 'none' | 'hit' | 'miss';
  executionCacheKey?: string;
  reason?: string;
}) {
  const routeSource = input.routeSource || input.resolvedRoute?.source;
  const routeModel = input.routeModel || input.resolvedRoute?.model;
  return {
    mediaType: input.intent.type,
    mediaStatus: input.status,
    mediaPrompt: input.intent.prompt,
    mediaIntentSource: input.intent.source,
    mediaError: input.reason,
    routeSource,
    routeModel,
    mediaPlannerTrigger: input.intent.plannerTrigger,
    mediaPlannerConfidence: input.intent.plannerConfidence,
    mediaPlannerBlockedReason: input.reason,
    mediaSpec: input.prepared?.spec,
    mediaSpecHash: input.prepared?.specHash,
    mediaResolvedRoute: input.resolvedRoute || undefined,
    mediaCompilerRevision: input.prepared?.compiled.compilerRevision,
    mediaShadow: input.shadow,
    mediaCacheStatus: input.cacheStatus,
    mediaExecutionCacheKey: input.executionCacheKey,
  };
}

export function createPendingMediaMessage(input: {
  intent: PendingMediaIntent;
  prepared?: PreparedMediaExecution;
  resolvedRoute?: LocalChatResolvedMediaRoute | null;
}): ChatMessage {
  const isImage = input.intent.type === 'image';
  return {
    id: input.intent.pendingMessageId,
    role: 'assistant',
    kind: isImage ? 'image-pending' : 'video-pending',
    content: '',
    timestamp: new Date(),
    meta: createBaseMediaMeta({
      intent: input.intent,
      prepared: input.prepared,
      status: 'pending',
      resolvedRoute: input.resolvedRoute,
      cacheStatus: 'none',
    }),
  };
}

export function createMediaFailureMessage(input: {
  intent: PendingMediaIntent;
  prepared?: PreparedMediaExecution;
  reason: string;
  routeSource?: MediaRouteSource;
  resolvedRoute?: LocalChatResolvedMediaRoute | null;
  shadow?: LocalChatMediaArtifactShadow;
  executionCacheKey?: string;
}): ChatMessage {
  return {
    id: input.intent.pendingMessageId,
    role: 'assistant',
    kind: input.intent.type,
    content: input.reason,
    timestamp: new Date(),
    meta: createBaseMediaMeta({
      intent: input.intent,
      prepared: input.prepared,
      status: 'failed',
      routeSource: input.routeSource,
      resolvedRoute: input.resolvedRoute,
      shadow: input.shadow,
      cacheStatus: 'miss',
      executionCacheKey: input.executionCacheKey,
      reason: input.reason,
    }),
  };
}

export function createMediaBlockedMessage(input: {
  intent: PendingMediaIntent;
  prepared?: PreparedMediaExecution;
  reason: string;
  routeSource: MediaRouteSource;
  resolvedRoute?: LocalChatResolvedMediaRoute | null;
  shadow?: LocalChatMediaArtifactShadow;
  executionCacheKey?: string;
}): ChatMessage {
  return {
    id: input.intent.pendingMessageId,
    role: 'assistant',
    kind: input.intent.type,
    content: input.reason,
    timestamp: new Date(),
    meta: createBaseMediaMeta({
      intent: input.intent,
      prepared: input.prepared,
      status: 'blocked',
      routeSource: input.routeSource,
      resolvedRoute: input.resolvedRoute,
      shadow: input.shadow,
      cacheStatus: 'none',
      executionCacheKey: input.executionCacheKey,
      reason: input.reason,
    }),
  };
}

export function createReadyMediaMessage(input: {
  intent: PendingMediaIntent;
  prepared?: PreparedMediaExecution;
  uri: string;
  mimeType: string;
  routeSource: MediaRouteSource;
  routeModel?: string;
  resolvedRoute?: LocalChatResolvedMediaRoute | null;
  shadow?: LocalChatMediaArtifactShadow;
  cacheStatus?: 'hit' | 'miss';
  executionCacheKey?: string;
  nsfwPolicy: 'disabled' | 'local-runtime-only' | 'allowed';
}): ChatMessage {
  return {
    id: input.intent.pendingMessageId,
    role: 'assistant',
    kind: input.intent.type,
    content: '',
    timestamp: new Date(),
    media: {
      uri: input.uri,
      mimeType: input.mimeType,
    },
    meta: {
      ...createBaseMediaMeta({
        intent: input.intent,
        prepared: input.prepared,
        status: 'ready',
        routeSource: input.routeSource,
        routeModel: input.routeModel,
        resolvedRoute: input.resolvedRoute,
        shadow: input.shadow,
        cacheStatus: input.cacheStatus || 'miss',
        executionCacheKey: input.executionCacheKey,
      }),
      nsfwPolicy: input.nsfwPolicy,
    },
  };
}
