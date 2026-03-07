import { asRecord } from '@nimiplatform/sdk/mod/utils';
import { type RuntimeCanonicalCapability, type RuntimeRouteBinding, type RuntimeRouteOptionsSnapshot } from '@nimiplatform/sdk/mod/runtime-route';
import { createRendererFlowId, logRendererEvent } from '@nimiplatform/sdk/mod/logging';
import { emitLocalChatLog } from '../../logging.js';
import type { ChatRouteSnapshot, UseLocalChatRuntimeRouteInput } from './types.js';

const ROUTE_OPTIONS_QUERY_TIMEOUT_MS = 6000;
type RouteCapability =
  | 'text.generate'
  | 'image.generate'
  | 'video.generate'
  | 'audio.synthesize'
  | 'audio.transcribe';

function safeLogRendererEvent(payload: Parameters<typeof logRendererEvent>[0]): void {
  emitLocalChatLog({
    level: payload.level,
    message: payload.message,
    flowId: payload.flowId,
    source: 'runtime-route.queries',
    costMs: payload.costMs,
    details: payload.details as Record<string, unknown> | undefined,
  });
  try {
    logRendererEvent(payload);
  } catch {
    // Logging must never break runtime-route option loading.
  }
}

function normalizeTokenApiBinding(
  binding: RuntimeRouteBinding,
  connectors: RuntimeRouteOptionsSnapshot['connectors'],
): RuntimeRouteBinding {
  void connectors;
  return {
    ...binding,
  };
}

function normalizeRouteOptionsSnapshot(
  snapshot: RuntimeRouteOptionsSnapshot | null,
): RuntimeRouteOptionsSnapshot | null {
  if (!snapshot || snapshot.connectors.length === 0) {
    return snapshot;
  }
  const selected = normalizeTokenApiBinding(snapshot.selected, snapshot.connectors);
  const resolvedDefault = snapshot.resolvedDefault
    ? normalizeTokenApiBinding(snapshot.resolvedDefault, snapshot.connectors)
    : undefined;
  if (
    selected === snapshot.selected
    && resolvedDefault === snapshot.resolvedDefault
  ) {
    return snapshot;
  }
  return {
    ...snapshot,
    selected,
    ...(resolvedDefault ? { resolvedDefault } : {}),
  };
}

export async function resolveRouteSnapshot(input: {
  runtimeClient: UseLocalChatRuntimeRouteInput['runtimeClient'];
  routeBinding: RuntimeRouteBinding | null;
  setRouteSnapshot: (value: ChatRouteSnapshot | null) => void;
  setStatusBanner: UseLocalChatRuntimeRouteInput['setStatusBanner'];
}) {
  try {
    const resolved = await input.runtimeClient.resolve({
      capability: 'text.generate',
      binding: input.routeBinding || undefined,
    });
    input.setRouteSnapshot({
      source: resolved.source,
      provider: resolved.provider,
      model: resolved.model,
      endpoint: resolved.source === 'local-runtime'
        ? (resolved.localProviderEndpoint || '-')
        : (resolved.localOpenAiEndpoint || '-'),
      connectorId: resolved.connectorId,
    });
  } catch (error) {
    input.setRouteSnapshot(null);
    input.setStatusBanner({
      kind: 'warn',
      message: error instanceof Error ? error.message : String(error || ''),
    });
  }
}

export async function loadRouteOptions(input: {
  capability: RouteCapability;
  runtimeClient: UseLocalChatRuntimeRouteInput['runtimeClient'];
  setRouteOptions: (value: RuntimeRouteOptionsSnapshot | null) => void;
}): Promise<RuntimeRouteOptionsSnapshot | null> {
  try {
    safeLogRendererEvent({
      level: 'debug',
      area: 'local-chat',
      message: `local-chat:${input.capability}-route-options:query:start`,
      details: {
        timeoutMs: ROUTE_OPTIONS_QUERY_TIMEOUT_MS,
      },
    });
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    const payload = await Promise.race<RuntimeRouteOptionsSnapshot>([
      input.runtimeClient.listOptions({
        capability: input.capability,
      }),
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`local-chat route options query timeout (${ROUTE_OPTIONS_QUERY_TIMEOUT_MS}ms)`));
        }, ROUTE_OPTIONS_QUERY_TIMEOUT_MS);
      }),
    ]).finally(() => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    });
    const resolved = normalizeRouteOptionsSnapshot(payload);
    safeLogRendererEvent({
      level: 'debug',
      area: 'local-chat',
      message: `local-chat:${input.capability}-route-options:loaded`,
      details: {
        selectedSource: resolved?.selected.source || null,
        selectedConnectorId: resolved?.selected.connectorId || null,
        selectedModel: resolved?.selected.model || null,
        connectorsCount: resolved?.connectors.length ?? 0,
        connectorIds: resolved?.connectors.map((item) => item.id) || [],
      },
    });
    input.setRouteOptions(resolved);
    return resolved;
  } catch (error) {
    input.setRouteOptions(null);
    safeLogRendererEvent({
      level: 'warn',
      area: 'local-chat',
      message: `local-chat:${input.capability}-route-options:failed`,
      details: {
        error: error instanceof Error ? error.message : String(error || ''),
      },
    });
    return null;
  }
}

export async function runRouteHealthCheck(input: {
  runtimeClient: UseLocalChatRuntimeRouteInput['runtimeClient'];
  routeBinding: RuntimeRouteBinding | null;
  setCheckingHealth: (value: boolean) => void;
  setHealthStatus: (value: 'idle' | 'checking' | 'healthy' | 'unreachable') => void;
  setStatusBanner?: (value: { kind: 'warn' | 'error' | 'success' | 'info'; message: string }) => void;
}) {
  input.setCheckingHealth(true);
  input.setHealthStatus('checking');
  const flowId = createRendererFlowId('local-chat-health-check');
  try {
    const result = await input.runtimeClient.checkHealth({
      capability: 'text.generate',
      binding: input.routeBinding || undefined,
    });
    const record = asRecord(result);
    const status = String(record.status || '');
    const reasonCode = String(record.reasonCode || '').trim();
    const actionHint = String(record.actionHint || '').trim();
    input.setHealthStatus(status === 'healthy' ? 'healthy' : 'unreachable');
    if (status !== 'healthy' && input.setStatusBanner) {
      input.setStatusBanner({
        kind: 'warn',
        message: `Route health degraded (${reasonCode || 'RUNTIME_ROUTE_UNAVAILABLE'})${actionHint ? ` · action: ${actionHint}` : ''}`,
      });
    }
    logRendererEvent({
      level: 'info',
      area: 'local-chat',
      message: 'action:health-check:done',
      flowId,
      details: { status, reasonCode, actionHint },
    });
  } catch (error) {
    input.setHealthStatus('unreachable');
    logRendererEvent({
      level: 'error',
      area: 'local-chat',
      message: 'action:health-check:failed',
      flowId,
      details: { error: error instanceof Error ? error.message : String(error || '') },
    });
  } finally {
    input.setCheckingHealth(false);
  }
}
