import type { ModRuntimeClient } from '@nimiplatform/sdk/mod/runtime';
import type { RuntimeRouteBinding } from '@nimiplatform/sdk/mod/runtime-route';
import type { KismetAiRawResponse, KismetError, RouteSourceDisplay } from '../types.js';
import { KISMET_REASON } from '../contracts.js';
import { parseResultFromText } from '../validation/parse-result-json.js';
import { emitKismetLog } from '../logging.js';

const ROUTE_UNAVAILABLE_REASON_CODES = new Set([
  'RUNTIME_ROUTE_UNAVAILABLE',
  'AI_ROUTE_UNAVAILABLE',
  'AI_CONNECTOR_ID_REQUIRED',
  'AI_MODEL_REQUIRED',
  'AI_CONNECTOR_NOT_FOUND',
  'AI_CONNECTOR_UNAVAILABLE',
]);

type GenerateJsonViaAiInput<T> = {
  aiClient: ModRuntimeClient['ai']['text'];
  systemPrompt: string;
  userPrompt: string;
  routeBinding?: RuntimeRouteBinding;
  abortSignal?: AbortSignal;
  validate: (raw: unknown) => { ok: true; data: T } | { ok: false; error: KismetError };
};

type GenerateJsonViaAiOutput<T> =
  | { ok: true; data: T; routeSource: RouteSourceDisplay; rawResponse: KismetAiRawResponse }
  | { ok: false; error: KismetError; rawResponse?: KismetAiRawResponse };

type NormalizedAiFailure = {
  message: string;
  reasonCode: string;
  actionHint: string;
  traceId?: string;
  upstreamReasonCode?: string;
};

function asRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }
  return input as Record<string, unknown>;
}

function extractReasonCodeFromMessage(message: string): string {
  const matched = String(message || '').match(/\b(AI_[A-Z_]+|RUNTIME_ROUTE_[A-Z_]+)\b/);
  return String(matched?.[1] || '').trim();
}

function isRouteUnavailable(input: { reasonCode: string; message: string }): boolean {
  const reasonCode = String(input.reasonCode || '').trim();
  const message = String(input.message || '').toLowerCase();
  if (ROUTE_UNAVAILABLE_REASON_CODES.has(reasonCode)) {
    return true;
  }
  if (reasonCode.startsWith('RUNTIME_ROUTE_') && reasonCode !== 'RUNTIME_ROUTE_HEALTHY') {
    return true;
  }
  return (
    message.includes('route unavailable')
    || (message.includes('connector') && message.includes('required'))
    || (message.includes('model') && message.includes('required'))
  );
}

function normalizeAiFailure(error: unknown): NormalizedAiFailure {
  const record = asRecord(error);
  const rawMessage = String(
    error instanceof Error ? error.message : record.message || error || '',
  ).trim();
  const rawReasonCode = String(record.reasonCode || record.code || '').trim() || extractReasonCodeFromMessage(rawMessage);
  const rawActionHint = String(record.actionHint || record.action_hint || '').trim();
  const traceId = String(record.traceId || record.promptTraceId || record.providerTraceId || '').trim();
  const routeUnavailable = isRouteUnavailable({
    reasonCode: rawReasonCode,
    message: rawMessage,
  });

  return {
    reasonCode: routeUnavailable ? KISMET_REASON.ROUTE_UNAVAILABLE : KISMET_REASON.AI_GENERATE_FAILED,
    message: rawMessage
      ? `AI 生成失败: ${rawMessage}`
      : routeUnavailable
        ? 'AI 生成失败: Runtime 路由不可用'
        : 'AI 生成失败',
    actionHint: rawActionHint || (
      routeUnavailable
        ? '请切换到 Prompt-Import 模式，或检查 Runtime 路由配置后重试。'
        : '请重试或切换到 Prompt-Import 模式。'
    ),
    ...(traceId ? { traceId } : {}),
    ...(rawReasonCode && rawReasonCode !== (routeUnavailable ? KISMET_REASON.ROUTE_UNAVAILABLE : KISMET_REASON.AI_GENERATE_FAILED)
      ? { upstreamReasonCode: rawReasonCode }
      : {}),
  };
}

export async function generateJsonViaAi<T>(input: GenerateJsonViaAiInput<T>): Promise<GenerateJsonViaAiOutput<T>> {
  try {
    const result = await input.aiClient.generate({
      input: input.userPrompt,
      system: input.systemPrompt,
      temperature: 0.4,
      ...(input.routeBinding ? {
        binding: input.routeBinding,
        model: input.routeBinding.model,
      } : {}),
    });

    const routeSource = result.trace.routeDecision || 'local-runtime';
    const rawText = String(result.text || '');
    const rawResponse = {
      text: rawText,
      traceId: result.trace.traceId || undefined,
      routeSource,
      resolvedModel: String(result.trace.modelResolved || '').trim() || undefined,
      resolvedConnectorId: undefined,
      resolvedProvider: undefined,
      length: rawText.length,
      escapedText: JSON.stringify(rawText),
      firstChar: rawText[0],
      lastChar: rawText[rawText.length - 1],
    } satisfies KismetAiRawResponse;
    emitKismetLog({
      level: 'info',
      message: 'action:ai-generate:raw-text',
      source: 'generateJsonViaAi',
      details: {
        traceId: rawResponse.traceId,
        routeSource,
        resolvedModel: rawResponse.resolvedModel,
        resolvedConnectorId: rawResponse.resolvedConnectorId,
        resolvedProvider: rawResponse.resolvedProvider,
        length: rawResponse.length,
        firstChar: rawResponse.firstChar,
        lastChar: rawResponse.lastChar,
        previewHead: rawText.slice(0, 120),
        previewTail: rawText.slice(-120),
      },
    });
    const parseResult = parseResultFromText(rawText);
    if (!parseResult.ok) {
      return {
        ok: false,
        error: {
          ...parseResult.error,
          traceId: result.trace.traceId || undefined,
        },
        rawResponse,
      };
    }

    const validated = input.validate(parseResult.data);
    if (!validated.ok) {
      return {
        ok: false,
        error: {
          ...validated.error,
          traceId: result.trace.traceId || undefined,
        },
        rawResponse,
      };
    }

    return {
      ok: true,
      data: validated.data,
      routeSource,
      rawResponse,
    };
  } catch (error) {
    const normalized = normalizeAiFailure(error);
    emitKismetLog({
      level: 'error',
      message: 'action:ai-generate:failed',
      source: 'generateJsonViaAi',
      details: {
        reasonCode: normalized.reasonCode,
        upstreamReasonCode: normalized.upstreamReasonCode,
        traceId: normalized.traceId,
      },
    });
    return {
      ok: false,
      error: normalized,
    };
  }
}
