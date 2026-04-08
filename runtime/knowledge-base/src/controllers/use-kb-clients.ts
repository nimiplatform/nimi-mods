// ---------------------------------------------------------------------------
// Client factory hook — creates SDK clients, route snapshots, and adapters
// ---------------------------------------------------------------------------
import { useCallback, useEffect, useMemo, useState } from 'react';
import { KB_MOD_ID } from '../contracts.js';
import { createLlmClientAdapter } from '../adapters/llm-adapter.js';
import { createEmbeddingClientAdapter } from '../adapters/embedding-adapter.js';
import type { LlmClient, EmbeddingClient } from '../types.js';
import { createKBFlowId, emitKBLog } from '../logging.js';
import {
    createEmptyAIConfig,
    createHookClient,
    createModRuntimeClient,
    parseRuntimeRouteOptions,
    type AIConfig,
    type HookClient,
    type ModRuntimeClient,
    type RuntimeRouteOptionsSnapshot,
} from "@nimiplatform/sdk/mod";
import {
    KB_AI_SCOPE_REF,
    deriveKnowledgeBaseRouteSelection,
    getKnowledgeBaseCapabilityBinding,
    getKnowledgeBaseAIConfig,
    hydrateKnowledgeBaseCapabilityBinding,
    resolveKnowledgeBaseRoute,
    subscribeKnowledgeBaseAIConfig,
    updateKnowledgeBaseCapabilityBinding,
    materializeKnowledgeBaseBinding,
    type KBRouteCapability,
} from './kb-ai-config.js';
type RouteCapability = 'text.generate' | 'text.embed';
export function useHookClient(): HookClient {
    return useMemo(() => createHookClient(KB_MOD_ID), []);
}
export function useRuntimeClient(): ModRuntimeClient {
    return useMemo(() => createModRuntimeClient(KB_MOD_ID), []);
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
function hydrateCapabilityBindingIfMissing(
    runtimeClient: ModRuntimeClient,
    capability: KBRouteCapability,
    options: RuntimeRouteOptionsSnapshot | null,
): AIConfig {
    hydrateKnowledgeBaseCapabilityBinding(runtimeClient, capability, options);
    return getKnowledgeBaseAIConfig(runtimeClient);
}
export function useKBClients(runtimeClient: ModRuntimeClient) {
    const [aiConfig, setAiConfig] = useState<AIConfig>(() => createEmptyAIConfig(KB_AI_SCOPE_REF));
    const [chatRouteOptions, setChatRouteOptions] = useState<RuntimeRouteOptionsSnapshot | null>(null);
    const [embeddingRouteOptions, setEmbeddingRouteOptions] = useState<RuntimeRouteOptionsSnapshot | null>(null);
    useEffect(() => {
        setAiConfig(getKnowledgeBaseAIConfig(runtimeClient));
        return subscribeKnowledgeBaseAIConfig(runtimeClient, (config) => {
            setAiConfig(config);
        });
    }, [runtimeClient]);
    const loadRouteOptions = useCallback(async (capability: RouteCapability): Promise<RuntimeRouteOptionsSnapshot | null> => {
        const flowId = createKBFlowId(`route-options-${capability}`);
        try {
            const options = ensureRouteOptionsSnapshotShape(parseRuntimeRouteOptions(await runtimeClient.route.listOptions({ capability }), {
                includeResolvedDefault: true,
            }));
            if (!options) {
                throw new Error('KB_ROUTE_OPTIONS_INVALID');
            }
            emitKBLog({
                level: 'info',
                message: 'route-options:loaded',
                flowId,
                source: 'useKBClients.loadRouteOptions',
                details: {
                    capability,
                    selectedSource: options.selected?.source || null,
                    selectedConnectorId: options.selected?.connectorId || null,
                    selectedModel: options.selected?.model || null,
                    connectorsCount: options.connectors.length,
                    localModelsCount: options.local?.models.length || 0,
                },
            });
            if (capability === 'text.generate') {
                setChatRouteOptions(options);
            }
            else {
                setEmbeddingRouteOptions(options);
            }
            setAiConfig(hydrateCapabilityBindingIfMissing(runtimeClient, capability, options));
            return options;
        }
        catch (error) {
            emitKBLog({
                level: 'warn',
                message: 'route-options:query-failed',
                flowId,
                source: 'useKBClients.loadRouteOptions',
                details: {
                    capability,
                    error: error instanceof Error ? error.message : String(error || ''),
                },
            });
            if (capability === 'text.generate') {
                setChatRouteOptions(null);
            }
            else {
                setEmbeddingRouteOptions(null);
            }
            return null;
        }
    }, [runtimeClient]);
    const refreshRouteOptions = useCallback(async () => {
        await Promise.all([
            loadRouteOptions('text.generate'),
            loadRouteOptions('text.embed'),
        ]);
    }, [loadRouteOptions]);
    useEffect(() => {
        void refreshRouteOptions();
        const timer = setInterval(() => {
            void refreshRouteOptions();
        }, 15000);
        return () => clearInterval(timer);
    }, [refreshRouteOptions]);
    const configuredChatBinding = useMemo(() =>
        getKnowledgeBaseCapabilityBinding(aiConfig, 'text.generate'), [aiConfig]);
    const configuredEmbeddingBinding = useMemo(() =>
        getKnowledgeBaseCapabilityBinding(aiConfig, 'text.embed'), [aiConfig]);
    const chatRouteSelection = useMemo(() =>
        deriveKnowledgeBaseRouteSelection(configuredChatBinding, chatRouteOptions), [
            configuredChatBinding,
            chatRouteOptions,
        ]);
    const embeddingRouteSelection = useMemo(() =>
        deriveKnowledgeBaseRouteSelection(configuredEmbeddingBinding, embeddingRouteOptions), [
            configuredEmbeddingBinding,
            embeddingRouteOptions,
        ]);
    const updateRouteSelection = useCallback((
        capability: KBRouteCapability,
        selection: ReturnType<typeof deriveKnowledgeBaseRouteSelection>,
        options: RuntimeRouteOptionsSnapshot | null,
    ) => {
        const binding = materializeKnowledgeBaseBinding(selection, options);
        if (!binding) {
            throw new Error(`KB_AI_CONFIG_BINDING_REQUIRED:${capability}`);
        }
        const nextConfig = updateKnowledgeBaseCapabilityBinding(runtimeClient, capability, binding);
        setAiConfig(nextConfig);
    }, [runtimeClient]);
    const llmClient: LlmClient = useMemo(() => createLlmClientAdapter(runtimeClient, {
        resolveConfig: () => aiConfig,
        resolveRoute: () => resolveKnowledgeBaseRoute(aiConfig, 'text.generate'),
    }), [
        runtimeClient,
        aiConfig,
    ]);
    const embeddingClient: EmbeddingClient = useMemo(() => createEmbeddingClientAdapter(runtimeClient, {
        resolveConfig: () => aiConfig,
        resolveRoute: () => resolveKnowledgeBaseRoute(aiConfig, 'text.embed'),
    }), [
        runtimeClient,
        aiConfig,
    ]);
    return {
        aiConfig,
        chatBinding: configuredChatBinding,
        embeddingBinding: configuredEmbeddingBinding,
        chatRouteSelection,
        embeddingRouteSelection,
        setChatRouteSelection: (selection: ReturnType<typeof deriveKnowledgeBaseRouteSelection>) =>
            updateRouteSelection('text.generate', selection, chatRouteOptions),
        setEmbeddingRouteSelection: (selection: ReturnType<typeof deriveKnowledgeBaseRouteSelection>) =>
            updateRouteSelection('text.embed', selection, embeddingRouteOptions),
        llmClient,
        embeddingClient,
        chatRouteOptions,
        embeddingRouteOptions,
        refreshRouteOptions,
    };
}
