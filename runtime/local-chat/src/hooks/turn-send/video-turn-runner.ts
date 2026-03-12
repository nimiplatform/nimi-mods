import type { LocalChatDefaultSettings } from '../../state/index.js';
import { emitLocalChatLog } from '../../logging.js';
import {
  isMediaGenerationAllowed,
  isPromptLikelyNsfw,
  type NsfwMediaPolicy,
} from '../../services/policy/nsfw-media-policy.js';
import { localChatMessage } from '../../i18n/messages.js';
import { resolveMediaRouteConfig, toPinnedRouteBinding } from './media-route.js';
import type { LocalChatAiClient } from '../../runtime-ai-client.js';
import type { LocalChatResolvedMediaRoute } from '../../types.js';

export type VideoTurnRunnerResult =
  | {
      status: 'ok';
      uri: string;
      mimeType: string;
      traceId: string;
      routeSource: 'local' | 'cloud';
      routeModel?: string;
    }
  | {
      status: 'blocked';
      reasonCode: 'LOCAL_CHAT_MEDIA_NSFW_BLOCKED';
      routeSource: 'local' | 'cloud';
      message: string;
    }
  | {
      status: 'failed';
      reasonCode: 'LOCAL_CHAT_MEDIA_GENERATE_FAILED';
      message: string;
      traceId?: string;
      routeSource?: 'local' | 'cloud';
    };

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error || 'media generation failed');
}

function buildNsfwBlockedMessage(input: {
  policy: NsfwMediaPolicy;
  routeSource: 'local' | 'cloud';
}): string {
  if (input.policy === 'disabled') {
    return localChatMessage(
      'MediaFeedback.videoBlockedDisabled',
      'Video generation was blocked: current content style is restrained, so this kind of visual will not be sent.',
    );
  }
  if (input.policy === 'local-only' && input.routeSource !== 'local') {
    return localChatMessage(
      'MediaFeedback.videoBlockedLocalOnly',
      'Video generation was blocked: current content style only allows local generation. Switch to Local and try again.',
    );
  }
  return localChatMessage(
    'MediaFeedback.videoBlockedGeneric',
    'Video generation was blocked: current content style does not allow this request.',
  );
}

function normalizeReasonCode(error: unknown): string {
  const directReasonCode = (
    error
    && typeof error === 'object'
    && 'reasonCode' in error
  ) ? String((error as { reasonCode?: unknown }).reasonCode || '').trim() : '';
  if (directReasonCode) {
    return directReasonCode;
  }
  const message = toErrorMessage(error);
  const matched = message.match(/\b[A-Z][A-Z0-9_]{3,}\b/);
  return matched?.[0] || '';
}

function resolveIntendedRouteSource(input: {
  routeSource: 'auto' | 'local' | 'cloud';
  fallbackRouteSource?: 'local' | 'cloud';
}): 'local' | 'cloud' {
  if (input.routeSource === 'local' || input.routeSource === 'cloud') {
    return input.routeSource;
  }
  return input.fallbackRouteSource || 'local';
}

function toFriendlyVideoErrorMessage(error: unknown): string {
  const reasonCode = normalizeReasonCode(error);
  if (reasonCode === 'AI_CONNECTOR_ID_REQUIRED') {
    return localChatMessage(
      'MediaFeedback.videoConnectorRequired',
      'Video generation failed: no media route is configured yet. Choose a connector in Media Route Config and try again.',
    );
  }
  if (reasonCode === 'AI_MODEL_REQUIRED') {
    return localChatMessage(
      'MediaFeedback.videoModelRequired',
      'Video generation failed: the current media route is missing a model. Add a model in Media Route Config and try again.',
    );
  }
  return toErrorMessage(error);
}

export async function runVideoTurn(input: {
  aiClient: Pick<LocalChatAiClient, 'resolveRoute' | 'generateVideo'>;
  prompt: string;
  defaultSettings: LocalChatDefaultSettings;
  nsfwPolicy: NsfwMediaPolicy;
  fallbackRouteSource?: 'local' | 'cloud';
  resolvedRoute?: LocalChatResolvedMediaRoute;
  negativePrompt?: string;
  durationSeconds?: number;
  aspectRatio?: string;
  cameraMotion?: string;
  referenceImageUrl?: string | null;
}): Promise<VideoTurnRunnerResult> {
  const normalizedPrompt = String(input.prompt || '').trim();
  if (!normalizedPrompt) {
    return {
      status: 'failed',
      reasonCode: 'LOCAL_CHAT_MEDIA_GENERATE_FAILED',
      message: localChatMessage('MediaFeedback.videoPromptEmpty', 'Video prompt is empty.'),
    };
  }

  const routeConfig = resolveMediaRouteConfig({
    kind: 'video',
    settings: input.defaultSettings,
    fallbackSource: input.fallbackRouteSource,
  });
  const intendedRouteSource = resolveIntendedRouteSource({
    routeSource: routeConfig.routeSource,
    fallbackRouteSource: input.fallbackRouteSource,
  });
  if (
    routeConfig.routeSource === 'cloud'
    && !String(routeConfig.routeBinding?.connectorId || '').trim()
  ) {
    return {
      status: 'failed',
      reasonCode: 'LOCAL_CHAT_MEDIA_GENERATE_FAILED',
      message: localChatMessage(
        'MediaFeedback.videoCloudConnectorMissing',
        'Video generation failed: select a video connector in Media Route Config first.',
      ),
      routeSource: 'cloud',
    };
  }
  const promptLikelyNsfw = isPromptLikelyNsfw(normalizedPrompt);
  let resolvedRouteSource: 'local' | 'cloud' = intendedRouteSource;

  try {
    const resolvedRoute = input.resolvedRoute
      ? {
        source: input.resolvedRoute.source,
        connectorId: input.resolvedRoute.connectorId || '',
        model: input.resolvedRoute.model,
        ...(input.resolvedRoute.localModelId ? { localModelId: input.resolvedRoute.localModelId } : {}),
      }
      : await input.aiClient.resolveRoute({
        capability: 'video.generate',
        routeBinding: routeConfig.routeBinding,
      });
    resolvedRouteSource = resolvedRoute.source === 'cloud' ? 'cloud' : 'local';
    if (!isMediaGenerationAllowed({
      policy: input.nsfwPolicy,
      routeSource: resolvedRouteSource,
      prompt: normalizedPrompt,
      isNsfwPrompt: promptLikelyNsfw,
    })) {
      return {
        status: 'blocked',
        reasonCode: 'LOCAL_CHAT_MEDIA_NSFW_BLOCKED',
        routeSource: resolvedRouteSource,
        message: buildNsfwBlockedMessage({
          policy: input.nsfwPolicy,
          routeSource: resolvedRouteSource,
        }),
      };
    }

    const pinnedRouteBinding = toPinnedRouteBinding(resolvedRoute);
    const referenceImageUrl = String(input.referenceImageUrl || '').trim();
    emitLocalChatLog({
      level: 'info',
      message: 'local-chat:video-turn:request',
      details: {
        routeSource: resolvedRoute.source,
        routeModel: resolvedRoute.model,
        localModelId: 'localModelId' in resolvedRoute ? String(resolvedRoute.localModelId || '') : '',
        requestedModel: pinnedRouteBinding.model || routeConfig.model || '',
        mode: referenceImageUrl ? 'i2v-reference' : 't2v',
        hasReferenceImage: Boolean(referenceImageUrl),
      },
    });
    const generated = await input.aiClient.generateVideo({
      capability: 'video.generate',
      routeBinding: pinnedRouteBinding,
      model: pinnedRouteBinding.model || routeConfig.model,
      prompt: normalizedPrompt,
      negativePrompt: input.negativePrompt,
      mode: referenceImageUrl ? 'i2v-reference' : 't2v',
      content: [
        { type: 'text', role: 'prompt', text: normalizedPrompt },
        ...(referenceImageUrl
          ? [{ type: 'image_url' as const, role: 'reference_image' as const, imageUrl: referenceImageUrl }]
          : []),
      ],
      options: {
        ...(typeof input.durationSeconds === 'number' ? { durationSec: input.durationSeconds } : {}),
        ...(input.aspectRatio ? { ratio: input.aspectRatio } : {}),
        ...(input.cameraMotion ? { cameraFixed: input.cameraMotion === 'fixed' } : {}),
      },
    });
    const finalRouteSource = generated.route.source === 'cloud' ? 'cloud' : 'local';
    const artifact = generated.videos.find((item) => String(item.uri || '').trim());
    if (!artifact) {
      return {
        status: 'failed',
        reasonCode: 'LOCAL_CHAT_MEDIA_GENERATE_FAILED',
        message: localChatMessage(
          'MediaFeedback.videoResponseMissingArtifact',
          'Video response does not contain artifact URI.',
        ),
        traceId: String(generated.traceId || '').trim() || undefined,
        routeSource: finalRouteSource,
      };
    }
    const uri = String(artifact.uri || '').trim();
    if (!uri) {
      return {
        status: 'failed',
        reasonCode: 'LOCAL_CHAT_MEDIA_GENERATE_FAILED',
        message: localChatMessage(
          'MediaFeedback.videoArtifactEmpty',
          'Video artifact URI is empty.',
        ),
        traceId: String(generated.traceId || '').trim() || undefined,
        routeSource: finalRouteSource,
      };
    }
    return {
      status: 'ok',
      uri,
      mimeType: String(artifact.mimeType || '').trim() || 'application/octet-stream',
      traceId: String(generated.traceId || '').trim(),
      routeSource: finalRouteSource,
      routeModel: String(generated.route.model || '').trim() || undefined,
    };
  } catch (error) {
    emitLocalChatLog({
      level: 'error',
      message: 'local-chat:video-turn:failed',
      details: {
        routeSource: resolvedRouteSource,
        error: error instanceof Error ? error.message : String(error || 'unknown error'),
      },
    });
    return {
      status: 'failed',
      reasonCode: 'LOCAL_CHAT_MEDIA_GENERATE_FAILED',
      message: toFriendlyVideoErrorMessage(error),
      routeSource: resolvedRouteSource,
    };
  }
}
