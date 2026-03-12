import { emitLocalChatLog } from '../../logging.js';
import { localChatMessage } from '../../i18n/messages.js';
import type { ChatRouteSnapshot, UseLocalChatRuntimeRouteInput } from './types.js';
import { asRecord, parseRuntimeRouteOptions, type RuntimeCanonicalCapability, type RuntimeRouteBinding, type RuntimeRouteOptionsSnapshot, createRendererFlowId, logRendererEvent } from "@nimiplatform/sdk/mod";
const ROUTE_OPTIONS_QUERY_TIMEOUT_MS = 6000;
type RouteCapability = 'text.generate' | 'image.generate' | 'video.generate' | 'audio.synthesize' | 'audio.transcribe';
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
    }
    catch {
        // Logging must never break runtime-route option loading.
    }
}
function normalizeTokenApiBinding(binding: RuntimeRouteBinding, connectors: RuntimeRouteOptionsSnapshot['connectors']): RuntimeRouteBinding {
    void connectors;
    return {
        ...binding,
    };
}
function normalizeRouteOptionsSnapshot(snapshot: unknown): RuntimeRouteOptionsSnapshot | null {
    const parsed = parseRuntimeRouteOptions(snapshot, {
        includeResolvedDefault: true,
    });
    if (!parsed || parsed.connectors.length === 0) {
        return parsed;
    }
    const selected = normalizeTokenApiBinding(parsed.selected, parsed.connectors);
    const resolvedDefault = parsed.resolvedDefault
        ? normalizeTokenApiBinding(parsed.resolvedDefault, parsed.connectors)
        : undefined;
    if (selected === parsed.selected
        && resolvedDefault === parsed.resolvedDefault) {
        return parsed;
    }
    return {
        ...parsed,
        selected,
        ...(resolvedDefault ? { resolvedDefault } : {}),
    };
}
function ensureRouteOptionsSnapshotShape(snapshot: RuntimeRouteOptionsSnapshot | null): RuntimeRouteOptionsSnapshot | null {
    if (!snapshot) {
        return null;
    }
    return {
        ...snapshot,
        local: {
            models: snapshot.local?.models || [],
            defaultEndpoint: snapshot.local?.defaultEndpoint,
        },
        connectors: Array.isArray(snapshot.connectors) ? snapshot.connectors : [],
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
            endpoint: resolved.source === 'local'
                ? (resolved.localProviderEndpoint || '-')
                : (resolved.localOpenAiEndpoint || '-'),
            connectorId: resolved.connectorId,
            localModelId: resolved.localModelId || undefined,
            goRuntimeLocalModelId: resolved.goRuntimeLocalModelId || undefined,
            goRuntimeStatus: resolved.goRuntimeStatus || undefined,
        });
    }
    catch (error) {
        input.setRouteSnapshot(null);
        input.setStatusBanner({
            kind: 'warning',
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
        const resolved = ensureRouteOptionsSnapshotShape(normalizeRouteOptionsSnapshot(payload));
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
    }
    catch (error) {
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
    setStatusBanner?: (value: {
        kind: 'warning' | 'error' | 'success' | 'info';
        message: string;
    }) => void;
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
            const actionSuffix = actionHint
                ? localChatMessage('TurnFeedback.routeHealthActionSuffix', ' · action: {{actionHint}}', { actionHint })
                : '';
            input.setStatusBanner({
                kind: 'warning',
                message: localChatMessage('TurnFeedback.routeHealthDegraded', 'Route health degraded ({{reasonCode}}){{actionSuffix}}', {
                    reasonCode: reasonCode || 'RUNTIME_ROUTE_UNAVAILABLE',
                    actionSuffix,
                }),
            });
        }
        logRendererEvent({
            level: 'info',
            area: 'local-chat',
            message: 'action:health-check:done',
            flowId,
            details: { status, reasonCode, actionHint },
        });
    }
    catch (error) {
        input.setHealthStatus('unreachable');
        logRendererEvent({
            level: 'error',
            area: 'local-chat',
            message: 'action:health-check:failed',
            flowId,
            details: { error: error instanceof Error ? error.message : String(error || '') },
        });
    }
    finally {
        input.setCheckingHealth(false);
    }
}
