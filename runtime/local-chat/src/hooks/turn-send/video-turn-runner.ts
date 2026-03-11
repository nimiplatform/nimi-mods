import type { LocalChatDefaultSettings } from '../../state/index.js';
import {
  isMediaGenerationAllowed,
  isPromptLikelyNsfw,
  type NsfwMediaPolicy,
} from '../../services/policy/nsfw-media-policy.js';
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
    return '已拦截本次视频生成：当前内容风格已收敛，本次不发送这类画面。';
  }
  if (input.policy === 'local-only' && input.routeSource !== 'local') {
    return '已拦截本次视频生成：当前内容风格仅支持本地生成，请切到“本地”后重试。';
  }
  return '已拦截本次视频生成：当前内容风格不允许该请求。';
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
    return '视频生成失败：当前还没有配置媒体路由。请在右侧“媒体路由配置”里选择连接器后重试。';
  }
  if (reasonCode === 'AI_MODEL_REQUIRED') {
    return '视频生成失败：当前媒体路由缺少模型配置。请在右侧“媒体路由配置”里补充模型后重试。';
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
      message: 'video prompt is empty',
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
      message: '视频生成失败：请先在右侧“媒体路由配置”中选择视频连接器。',
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
        message: 'video response does not contain artifact uri',
        traceId: String(generated.traceId || '').trim() || undefined,
        routeSource: finalRouteSource,
      };
    }
    const uri = String(artifact.uri || '').trim();
    if (!uri) {
      return {
        status: 'failed',
        reasonCode: 'LOCAL_CHAT_MEDIA_GENERATE_FAILED',
        message: 'video artifact uri is empty',
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
    return {
      status: 'failed',
      reasonCode: 'LOCAL_CHAT_MEDIA_GENERATE_FAILED',
      message: toFriendlyVideoErrorMessage(error),
      routeSource: resolvedRouteSource,
    };
  }
}
