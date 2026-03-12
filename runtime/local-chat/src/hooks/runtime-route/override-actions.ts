import { pickChatModelForConnector } from '../../services/route/route-override-store.js';
import { findLocalRuntimeModelForBinding, resolveLocalRuntimeModelsForScenario, } from '../../services/route/connector-model-capabilities.js';
import { type RuntimeRouteBinding, type RuntimeRouteOptionsSnapshot, type RuntimeRouteSource } from "@nimiplatform/sdk/mod";
export function resolveCommittedChatModelQuery(input: {
    source: RuntimeRouteSource;
    query: string;
    activeModel: string;
    availableModels: string[];
}): {
    nextQuery: string;
    nextModel: string | null;
} {
    const trimmedQuery = String(input.query || '').trim();
    const activeModel = String(input.activeModel || '').trim();
    if (!trimmedQuery) {
        return {
            nextQuery: activeModel,
            nextModel: null,
        };
    }
    if (input.source === 'cloud') {
        return {
            nextQuery: trimmedQuery,
            nextModel: trimmedQuery === activeModel ? null : trimmedQuery,
        };
    }
    if (input.availableModels.includes(trimmedQuery)) {
        return {
            nextQuery: trimmedQuery,
            nextModel: trimmedQuery === activeModel ? null : trimmedQuery,
        };
    }
    return {
        nextQuery: activeModel,
        nextModel: null,
    };
}
export function buildRouteBindingForSource(input: {
    source: RuntimeRouteSource;
    previous: RuntimeRouteBinding | null;
    options: RuntimeRouteOptionsSnapshot | null;
}): RuntimeRouteBinding {
    const base = input.previous || input.options?.selected || {
        source: 'local' as const,
        connectorId: '',
        model: '',
    };
    const firstLocalModel = resolveLocalRuntimeModelsForScenario({
        models: input.options?.local?.models || [],
        scenario: 'text.generate',
    })[0]
        || findLocalRuntimeModelForBinding({
            models: input.options?.local?.models || [],
            binding: {
                model: base.model,
                localModelId: base.localModelId,
                goRuntimeLocalModelId: base.goRuntimeLocalModelId,
            },
        });
    if (input.source === 'local') {
        return {
            source: 'local',
            connectorId: '',
            model: firstLocalModel?.model || base.model || '',
            localModelId: firstLocalModel?.localModelId || base.localModelId,
            engine: firstLocalModel?.engine || base.engine,
            goRuntimeLocalModelId: firstLocalModel?.goRuntimeLocalModelId || base.goRuntimeLocalModelId,
            goRuntimeStatus: firstLocalModel?.goRuntimeStatus || base.goRuntimeStatus,
        };
    }
    const firstConnector = input.options?.connectors[0];
    return {
        source: 'cloud',
        connectorId: firstConnector?.id || base.connectorId || '',
        model: pickChatModelForConnector(firstConnector || null, base.model || ''),
        localModelId: undefined,
        engine: undefined,
    };
}
export function buildRouteBindingForConnector(input: {
    connectorId: string;
    previous: RuntimeRouteBinding | null;
    options: RuntimeRouteOptionsSnapshot | null;
}): RuntimeRouteBinding {
    const connector = input.options?.connectors.find((item) => item.id === input.connectorId) || null;
    const base = input.previous || input.options?.selected || {
        source: 'cloud' as const,
        connectorId: '',
        model: '',
    };
    return {
        source: 'cloud',
        connectorId: input.connectorId,
        model: pickChatModelForConnector(connector, base.model || ''),
    };
}
export function buildRouteBindingForModel(input: {
    model: string;
    previous: RuntimeRouteBinding | null;
    options: RuntimeRouteOptionsSnapshot | null;
}): RuntimeRouteBinding {
    const base = input.previous || input.options?.selected || {
        source: 'local' as const,
        connectorId: '',
        model: '',
    };
    if (base.source === 'local') {
        const matchedLocalModel = findLocalRuntimeModelForBinding({
            models: resolveLocalRuntimeModelsForScenario({
                models: input.options?.local?.models || [],
                scenario: 'chat',
            }),
            binding: {
                model: input.model,
                localModelId: input.model,
            },
        });
        return {
            source: 'local',
            connectorId: '',
            model: input.model,
            ...(matchedLocalModel?.localModelId ? { localModelId: matchedLocalModel.localModelId } : {}),
            ...(matchedLocalModel?.engine ? { engine: matchedLocalModel.engine } : {}),
            ...(matchedLocalModel?.goRuntimeLocalModelId ? { goRuntimeLocalModelId: matchedLocalModel.goRuntimeLocalModelId } : {}),
            ...(matchedLocalModel?.goRuntimeStatus ? { goRuntimeStatus: matchedLocalModel.goRuntimeStatus } : {}),
        };
    }
    return {
        source: 'cloud',
        connectorId: base.connectorId,
        model: input.model,
        localModelId: undefined,
        engine: undefined,
    };
}
