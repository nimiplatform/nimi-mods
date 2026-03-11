import { asRecord } from '@nimiplatform/sdk/mod/utils';
import { createLocalChatFlowId, emitLocalChatLog } from '../logging.js';
import { withOpenApiContextLock } from './core-query-bridge.js';
import type { LocalChatReadContext } from './types.js';

export function asNullableRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

export function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

export function asNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  return value;
}

export function normalizeRealmBaseUrl(value: unknown): string {
  const text = String(value || '').trim();
  return text ? text.replace(/\/+$/, '') : '';
}

export function normalizeApiError(error: unknown, fallbackMessage: string): Error {
  if (error instanceof Error) return error;
  const record = asRecord(error);
  const code = asString(record.code || record.error);
  const message = asString(record.message || record.error_description);
  if (code || message) {
    return new Error([code, message].filter(Boolean).join(': '));
  }
  return new Error(fallbackMessage);
}

export async function withReadContext<T>(
  context: LocalChatReadContext,
  task: () => Promise<T>,
  options?: {
    flowId?: string;
    source?: string;
  },
): Promise<T> {
  const flowId = options?.flowId || createLocalChatFlowId('local-chat-read');
  const source = options?.source || 'withReadContext';
  const startedAt = performance.now();
  const realmBaseUrl = normalizeRealmBaseUrl(context.realmBaseUrl);
  if (!realmBaseUrl) {
    emitLocalChatLog({
      level: 'error',
      message: 'phase:with-read-context:failed',
      flowId,
      source,
      details: {
        reason: 'missing-realm-base-url',
      },
    });
    throw new Error('LOCAL_CHAT_REALM_BASE_URL_REQUIRED: realmBaseUrl is required');
  }

  emitLocalChatLog({
    level: 'debug',
    message: 'phase:with-read-context:start',
    flowId,
    source,
    details: {
      realmBaseUrl,
      hasAccessToken: Boolean(String(context.accessToken || '').trim()),
      hasFetchImpl: typeof context.fetchImpl === 'function',
    },
  });

  try {
    const result = await withOpenApiContextLock(
      {
        realmBaseUrl,
        accessToken: context.accessToken || undefined,
        fetchImpl: context.fetchImpl || undefined,
      },
      task,
    );
    emitLocalChatLog({
      level: 'info',
      message: 'phase:with-read-context:done',
      flowId,
      source,
      costMs: Number((performance.now() - startedAt).toFixed(2)),
    });
    return result;
  } catch (error) {
    const normalizedError = normalizeApiError(error, 'LOCAL_CHAT_DATA_API_FAILED');
    emitLocalChatLog({
      level: 'error',
      message: 'phase:with-read-context:failed',
      flowId,
      source,
      costMs: Number((performance.now() - startedAt).toFixed(2)),
      details: {
        error: normalizedError.message,
      },
    });
    throw normalizedError;
  }
}
