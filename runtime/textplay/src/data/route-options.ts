import { TEXTPLAY_REASON, } from '../contracts.js';
import { TextplayPipelineError } from '../pipeline/error.js';
import { type ModRuntimeClient, type RuntimeRouteOptionsSnapshot } from "@nimiplatform/sdk/mod";
export type TextplayRouteAvailability = {
    source: string;
    connectorId: string;
    model: string;
};
export async function queryTextplayChatRouteOptions(input: {
    runtimeClient: ModRuntimeClient['route'];
}): Promise<RuntimeRouteOptionsSnapshot> {
    return input.runtimeClient.listOptions({
        capability: 'text.generate',
    }).catch((error) => {
        throw new TextplayPipelineError({
            reasonCode: TEXTPLAY_REASON.ROUTE_UNAVAILABLE,
            actionHint: 'Switch to an available route source and retry.',
            message: error instanceof Error ? error.message : String(error || ''),
            stage: 'route',
            retryClass: 'retryable',
        });
    });
}
export async function assertTextplayChatRouteAvailable(input: {
    runtimeClient: ModRuntimeClient['route'];
}): Promise<TextplayRouteAvailability> {
    const parsed = await queryTextplayChatRouteOptions(input);
    const binding = parsed.selected || parsed.resolvedDefault || null;
    if (!binding) {
        throw new TextplayPipelineError({
            reasonCode: TEXTPLAY_REASON.ROUTE_UNAVAILABLE,
            actionHint: 'Switch to an available route source and retry.',
            message: 'TEXTPLAY_ROUTE_BINDING_UNAVAILABLE',
            stage: 'route',
            retryClass: 'retryable',
        });
    }
    return {
        source: binding.source,
        connectorId: binding.connectorId,
        model: binding.model,
    };
}
