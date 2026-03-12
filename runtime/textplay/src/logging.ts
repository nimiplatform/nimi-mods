import { createUlid } from './utils/ulid.js';
import { emitRuntimeLog } from "@nimiplatform/sdk/mod";
export function createTextplayFlowId(prefix: string): string {
    return `${prefix.toLowerCase()}-${createUlid()}`;
}
export function emitTextplayLog(input: {
    level?: 'debug' | 'info' | 'warn' | 'error';
    message: string;
    flowId?: string;
    source?: string;
    costMs?: number;
    details?: Record<string, unknown>;
}): void {
    const { level = 'info', message, flowId, source, costMs, details, } = input;
    try {
        emitRuntimeLog({
            level,
            area: 'textplay',
            message,
            flowId,
            source,
            costMs,
            details,
        });
    }
    catch (error) {
        const normalized = error instanceof Error ? error.message : String(error || '');
        const code = (error && typeof error === 'object' && 'code' in error
            ? String((error as {
                code?: unknown;
            }).code || '')
            : '');
        if (code === 'SDK_MOD_HOST_MISSING'
            || normalized.includes('MOD_SDK_HOST_NOT_READY')
            || normalized.includes('mod SDK host is not ready')) {
            return;
        }
        throw error;
    }
}
