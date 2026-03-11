import type { LocalChatDefaultSettings } from '../../state/index.js';
import {
  isMediaGenerationAllowed,
  isPromptLikelyNsfw,
  type NsfwMediaPolicy,
} from '../../services/policy/nsfw-media-policy.js';
import { localChatMessage } from '../../i18n/messages.js';
import { resolveMediaRouteConfig, toPinnedRouteBinding } from './media-route.js';
import type { LocalChatAiClient } from '../../runtime-ai-client.js';
import type { LocalChatResolvedMediaRoute } from '../../types.js';

export type ImageTurnRunnerResult =
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
      'MediaFeedback.imageBlockedDisabled',
      'Image generation was blocked: current content style is restrained, so this kind of visual will not be sent.',
    );
  }
  if (input.policy === 'local-only' && input.routeSource !== 'local') {
    return localChatMessage(
      'MediaFeedback.imageBlockedLocalOnly',
      'Image generation was blocked: current content style only allows local generation. Switch to Local and try again.',
    );
  }
  return localChatMessage(
    'MediaFeedback.imageBlockedGeneric',
    'Image generation was blocked: current content style does not allow this request.',
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

function toFriendlyImageErrorMessage(error: unknown): string {
  const reasonCode = normalizeReasonCode(error);
  if (reasonCode === 'AI_CONNECTOR_ID_REQUIRED') {
    return localChatMessage(
      'MediaFeedback.imageConnectorRequired',
      'Image generation failed: no media route is configured yet. Choose a connector in Media Route Config and try again.',
    );
  }
  if (reasonCode === 'AI_MODEL_REQUIRED') {
    return localChatMessage(
      'MediaFeedback.imageModelRequired',
      'Image generation failed: the current media route is missing a model. Add a model in Media Route Config and try again.',
    );
  }
  return toErrorMessage(error);
}

export async function runImageTurn(input: {
  aiClient: Pick<LocalChatAiClient, 'resolveRoute' | 'generateImage'>;
  prompt: string;
  defaultSettings: LocalChatDefaultSettings;
  nsfwPolicy: NsfwMediaPolicy;
  fallbackRouteSource?: 'local' | 'cloud';
  resolvedRoute?: LocalChatResolvedMediaRoute;
  negativePrompt?: string;
  size?: string;
  aspectRatio?: string;
  quality?: string;
  style?: string;
  count?: number;
  referenceImages?: string[];
}): Promise<ImageTurnRunnerResult> {
  const normalizedPrompt = String(input.prompt || '').trim();
  if (!normalizedPrompt) {
    return {
      status: 'failed',
      reasonCode: 'LOCAL_CHAT_MEDIA_GENERATE_FAILED',
      message: localChatMessage('MediaFeedback.imagePromptEmpty', 'Image prompt is empty.'),
    };
  }

  const routeConfig = resolveMediaRouteConfig({
    kind: 'image',
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
        'MediaFeedback.imageCloudConnectorMissing',
        'Image generation failed: select an image connector in Media Route Config first.',
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
        localModelId: input.resolvedRoute.model,
      }
      : await input.aiClient.resolveRoute({
        capability: 'image.generate',
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
    const generated = await input.aiClient.generateImage({
      capability: 'image.generate',
      routeBinding: pinnedRouteBinding,
      model: pinnedRouteBinding.model || routeConfig.model,
      prompt: normalizedPrompt,
      negativePrompt: input.negativePrompt,
      referenceImages: input.referenceImages,
      extensions: {
        ...(input.size ? { size: input.size } : {}),
        ...(input.aspectRatio ? { aspectRatio: input.aspectRatio } : {}),
        ...(input.quality ? { quality: input.quality } : {}),
        ...(input.style ? { style: input.style } : {}),
        ...(typeof input.count === 'number' ? { count: input.count } : {}),
      },
    });
    const finalRouteSource = generated.route.source === 'cloud' ? 'cloud' : 'local';
    const artifact = generated.images.find((item) => {
      const uri = String(item.uri || '').trim();
      const b64 = String(item.b64Json || '').trim();
      return Boolean(uri || b64);
    });
    if (!artifact) {
      return {
        status: 'failed',
        reasonCode: 'LOCAL_CHAT_MEDIA_GENERATE_FAILED',
        message: localChatMessage(
          'MediaFeedback.imageResponseMissingArtifact',
          'Image response does not contain artifact data.',
        ),
        traceId: String(generated.traceId || '').trim() || undefined,
        routeSource: finalRouteSource,
      };
    }
    const mimeType = String(artifact.mimeType || '').trim() || 'application/octet-stream';
    const b64 = String(artifact.b64Json || '').trim();
    const uri = String(artifact.uri || '').trim() || (b64 ? `data:${mimeType};base64,${b64}` : '');
    if (!uri) {
      return {
        status: 'failed',
        reasonCode: 'LOCAL_CHAT_MEDIA_GENERATE_FAILED',
        message: localChatMessage(
          'MediaFeedback.imageArtifactEmpty',
          'Image artifact URI is empty.',
        ),
        traceId: String(generated.traceId || '').trim() || undefined,
        routeSource: finalRouteSource,
      };
    }
    return {
      status: 'ok',
      uri,
      mimeType,
      traceId: String(generated.traceId || '').trim(),
      routeSource: finalRouteSource,
      routeModel: String(generated.route.model || '').trim() || undefined,
    };
  } catch (error) {
    return {
      status: 'failed',
      reasonCode: 'LOCAL_CHAT_MEDIA_GENERATE_FAILED',
      message: toFriendlyImageErrorMessage(error),
      routeSource: resolvedRouteSource,
    };
  }
}
