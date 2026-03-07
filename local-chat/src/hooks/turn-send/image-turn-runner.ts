import type { LocalChatDefaultSettings } from '../../state/index.js';
import {
  isMediaGenerationAllowed,
  isPromptLikelyNsfw,
  type NsfwMediaPolicy,
} from '../../services/policy/nsfw-media-policy.js';
import { resolveMediaRouteConfig, toPinnedRouteBinding } from './media-route.js';
import type { LocalChatAiClient } from '../../runtime-ai-client.js';
import type { LocalChatResolvedMediaRoute } from '../../types.js';

export type ImageTurnRunnerResult =
  | {
      status: 'ok';
      uri: string;
      mimeType: string;
      traceId: string;
      routeSource: 'local-runtime' | 'token-api';
      routeModel?: string;
    }
  | {
      status: 'blocked';
      reasonCode: 'LOCAL_CHAT_MEDIA_NSFW_BLOCKED';
      routeSource: 'local-runtime' | 'token-api';
      message: string;
    }
  | {
      status: 'failed';
      reasonCode: 'LOCAL_CHAT_MEDIA_GENERATE_FAILED';
      message: string;
      traceId?: string;
      routeSource?: 'local-runtime' | 'token-api';
    };

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error || 'media generation failed');
}

function buildNsfwBlockedMessage(input: {
  policy: NsfwMediaPolicy;
  routeSource: 'local-runtime' | 'token-api';
}): string {
  if (input.policy === 'disabled') {
    return '已拦截本次图片生成：当前未开启 NSFW 媒体。';
  }
  if (input.policy === 'local-runtime-only' && input.routeSource !== 'local-runtime') {
    return '已拦截本次图片生成：NSFW 仅允许本地路由。请切到“本地运行时”后重试。';
  }
  return '已拦截本次图片生成：当前 NSFW 策略不允许该请求。';
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
  routeSource: 'auto' | 'local-runtime' | 'token-api';
  fallbackRouteSource?: 'local-runtime' | 'token-api';
}): 'local-runtime' | 'token-api' {
  if (input.routeSource === 'local-runtime' || input.routeSource === 'token-api') {
    return input.routeSource;
  }
  return input.fallbackRouteSource || 'local-runtime';
}

function toFriendlyImageErrorMessage(error: unknown): string {
  const reasonCode = normalizeReasonCode(error);
  if (reasonCode === 'AI_CONNECTOR_ID_REQUIRED') {
    return '图片生成失败：当前还没有配置媒体路由。请在右侧“媒体路由配置”里选择连接器后重试。';
  }
  if (reasonCode === 'AI_MODEL_REQUIRED') {
    return '图片生成失败：当前媒体路由缺少模型配置。请在右侧“媒体路由配置”里补充模型后重试。';
  }
  return toErrorMessage(error);
}

export async function runImageTurn(input: {
  aiClient: Pick<LocalChatAiClient, 'resolveRoute' | 'generateImage'>;
  prompt: string;
  defaultSettings: LocalChatDefaultSettings;
  nsfwPolicy: NsfwMediaPolicy;
  fallbackRouteSource?: 'local-runtime' | 'token-api';
  resolvedRoute?: LocalChatResolvedMediaRoute;
  negativePrompt?: string;
  size?: string;
  aspectRatio?: string;
  quality?: string;
  style?: string;
  count?: number;
}): Promise<ImageTurnRunnerResult> {
  const normalizedPrompt = String(input.prompt || '').trim();
  if (!normalizedPrompt) {
    return {
      status: 'failed',
      reasonCode: 'LOCAL_CHAT_MEDIA_GENERATE_FAILED',
      message: 'image prompt is empty',
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
    routeConfig.routeSource === 'token-api'
    && !String(routeConfig.routeBinding?.connectorId || '').trim()
  ) {
    return {
      status: 'failed',
      reasonCode: 'LOCAL_CHAT_MEDIA_GENERATE_FAILED',
      message: '图片生成失败：请先在右侧“媒体路由配置”中选择图片连接器。',
      routeSource: 'token-api',
    };
  }
  const promptLikelyNsfw = isPromptLikelyNsfw(normalizedPrompt);
  let resolvedRouteSource: 'local-runtime' | 'token-api' = intendedRouteSource;

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
    resolvedRouteSource = resolvedRoute.source === 'token-api' ? 'token-api' : 'local-runtime';
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
      extensions: {
        ...(input.size ? { size: input.size } : {}),
        ...(input.aspectRatio ? { aspectRatio: input.aspectRatio } : {}),
        ...(input.quality ? { quality: input.quality } : {}),
        ...(input.style ? { style: input.style } : {}),
        ...(typeof input.count === 'number' ? { count: input.count } : {}),
      },
    });
    const finalRouteSource = generated.route.source === 'token-api' ? 'token-api' : 'local-runtime';
    const artifact = generated.images.find((item) => {
      const uri = String(item.uri || '').trim();
      const b64 = String(item.b64Json || '').trim();
      return Boolean(uri || b64);
    });
    if (!artifact) {
      return {
        status: 'failed',
        reasonCode: 'LOCAL_CHAT_MEDIA_GENERATE_FAILED',
        message: 'image response does not contain artifact data',
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
        message: 'image artifact uri is empty',
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
