import { createRendererFlowId, logRendererEvent } from "@nimiplatform/sdk/mod";
export function createWorldStudioFlowId(prefix: string): string {
    return createRendererFlowId(prefix.startsWith('world-studio') ? prefix : `world-studio-${prefix}`);
}
export function emitWorldStudioLog(input: {
    level?: 'debug' | 'info' | 'warn' | 'error';
    message: string;
    flowId?: string;
    source?: string;
    costMs?: number;
    details?: Record<string, unknown>;
}) {
    logRendererEvent({
        level: input.level || 'info',
        area: 'world-studio',
        message: input.message,
        flowId: input.flowId,
        source: input.source,
        costMs: input.costMs,
        details: input.details,
    });
}

export function emitWorldStudioDiag(input: {
    stage: string;
    event: string;
    level?: 'debug' | 'info' | 'warn' | 'error';
    flowId?: string;
    source?: string;
    costMs?: number;
    details?: Record<string, unknown>;
}) {
    emitWorldStudioLog({
        level: input.level || 'debug',
        message: `world-studio:diag:${input.stage}:${input.event}`,
        flowId: input.flowId,
        source: input.source,
        costMs: input.costMs,
        details: input.details,
    });
}
