// ---------------------------------------------------------------------------
// Route selector — loads available connectors for chat + TTS, manages selection
// Route data comes from runtime.route.* only:
//   1. runtime.route.listOptions() for capability-scoped options
//   2. runtime.route.resolve() for effective route binding
//   3. Periodic polling to keep options fresh
// ---------------------------------------------------------------------------
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    createEmptyAIConfig,
    parseRuntimeRouteOptions,
    type AIConfig,
    type RuntimeCanonicalCapability,
    type RuntimeRouteConnectorOption,
    type RuntimeRouteBinding,
    type RuntimeRouteOptionsSnapshot,
    type ModRuntimeClient,
} from "@nimiplatform/sdk/mod";
import {
    AUDIO_BOOK_AI_SCOPE_REF,
    clearLegacyAudioBookRouteSelections,
    deriveAudioBookRouteSelection,
    getAudioBookAIConfig,
    getAudioBookCapabilityBinding,
    hydrateAudioBookCapabilityBinding,
    materializeAudioBookBinding,
    readLegacyAudioBookRouteSelections,
    subscribeAudioBookAIConfig,
    updateAudioBookCapabilityBinding,
    type RouteSelection,
} from './audio-book-ai-config.js';
export type TtsRouteState = {
    chatConnectors: RuntimeRouteConnectorOption[];
    ttsConnectors: RuntimeRouteConnectorOption[];
    chatBinding?: RuntimeRouteBinding;
    ttsBinding?: RuntimeRouteBinding;
    chatSelection: RouteSelection;
    ttsSelection: RouteSelection;
    loading: boolean;
    error: string | null;
    selectChatConnector: (connectorId: string) => void;
    selectChatModel: (model: string) => void;
    selectTtsConnector: (connectorId: string) => void;
};
const QUERY_TIMEOUT_MS = 8000;
const LOG_PREFIX = '[audio-book:route]';
const RETRY_DELAYS_MS = [0, 300, 800, 1500];
const POLL_INTERVAL_WITH_CONNECTORS_MS = 15000;
const POLL_INTERVAL_WITHOUT_CONNECTORS_MS = 30000;
const TTS_MODEL_HINTS = ['tts', 'speech', 'audio', 'voice'];
const NON_CHAT_MODEL_HINTS = ['tts', 'speech', 'audio', 'voice', 'embedding', 'embed', 'rerank'];
const DASHSCOPE_TTS_MODEL_PREFERENCES = [
    'qwen3-tts-instruct-flash',
    'qwen3-tts-instruct',
    'qwen-tts-latest',
];
const OPENAI_TTS_MODEL_PREFERENCES = [
    'gpt-4o-mini-tts',
    'gpt-4o-audio-preview',
];
const emptySelection: RouteSelection = { connectorId: '', routeSource: 'auto' };
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
// ---------------------------------------------------------------------------
async function loadRouteOptions(runtimeClient: ModRuntimeClient, capability: RuntimeCanonicalCapability): Promise<RuntimeRouteOptionsSnapshot | null> {
    try {
        const rawSnapshot = await Promise.race<unknown>([
            runtimeClient.route.listOptions({ capability }),
            new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error(`Route options timeout (${QUERY_TIMEOUT_MS}ms)`)), QUERY_TIMEOUT_MS);
            }),
        ]);
        const snapshot = ensureRouteOptionsSnapshotShape(parseRuntimeRouteOptions(rawSnapshot, {
            includeResolvedDefault: true,
        }));
        if (!snapshot) {
            throw new Error('AUDIO_BOOK_ROUTE_OPTIONS_INVALID');
        }
        console.info(LOG_PREFIX, 'loadRouteOptions:ok', {
            capability,
            selectedSource: snapshot.selected?.source || '(none)',
            selectedConnectorId: snapshot.selected?.connectorId || '(none)',
            connectorsCount: snapshot.connectors.length,
            connectorIds: snapshot.connectors.map((connector) => connector.id),
        });
        return snapshot;
    }
    catch (err) {
        console.warn(LOG_PREFIX, 'loadRouteOptions:failed', {
            capability,
            error: err instanceof Error ? err.message : String(err),
        });
        return null;
    }
}
async function resolveRouteBinding(runtimeClient: ModRuntimeClient, capability: RuntimeCanonicalCapability, selection?: RouteSelection): Promise<{
    source: string;
    connectorId: string;
    model: string;
} | null> {
    try {
        const resolved = await runtimeClient.route.resolve({
            capability,
            binding: selection
                ? {
                    source: selection.routeSource === 'cloud' || selection.routeSource === 'local'
                        ? selection.routeSource
                        : 'cloud',
                    connectorId: String(selection.connectorId || '').trim(),
                    model: String(selection.model || '').trim(),
                }
                : undefined,
        });
        console.info(LOG_PREFIX, 'resolveRoute:ok', {
            capability,
            source: resolved.source,
            connectorId: resolved.connectorId || '(none)',
            model: resolved.model || '(none)',
            provider: resolved.provider || '(none)',
        });
        return {
            source: String(resolved.source || ''),
            connectorId: String(resolved.connectorId || ''),
            model: String(resolved.model || ''),
        };
    }
    catch (err) {
        console.warn(LOG_PREFIX, 'resolveRoute:failed', {
            capability,
            error: err instanceof Error ? err.message : String(err),
        });
        return null;
    }
}
// ---------------------------------------------------------------------------
// Selection resolver
// ---------------------------------------------------------------------------
type RouteSelectionFallback = {
    connectorId: string;
    model: string;
};
function normalizeModel(model: string): string {
    return String(model || '').trim();
}
function isPlaceholderModel(model: string): boolean {
    const normalized = normalizeModel(model).toLowerCase();
    return !normalized || normalized === 'local-model' || normalized.endsWith('/local-model');
}
function isVoiceDesignTtsModel(model: string): boolean {
    const normalized = normalizeModel(model).toLowerCase();
    if (!normalized)
        return false;
    if (normalized.includes('tts-vd'))
        return true;
    if (normalized.includes('-vd-'))
        return true;
    if (/(^|[-_/])vd($|[-_/])/.test(normalized) && normalized.includes('tts'))
        return true;
    return false;
}
function isLikelyTtsModel(model: string): boolean {
    const normalized = normalizeModel(model).toLowerCase();
    if (!normalized)
        return false;
    if (isVoiceDesignTtsModel(normalized))
        return false;
    if (TTS_MODEL_HINTS.some((hint) => normalized.includes(hint)))
        return true;
    if (normalized.includes('qwen3-tts'))
        return true;
    if (normalized.includes('gpt-4o-mini-tts'))
        return true;
    return false;
}
function pickByPreferredPrefix(models: string[], preferences: string[]): string {
    for (const pref of preferences) {
        const exact = models.find((model) => model.toLowerCase() === pref.toLowerCase());
        if (exact)
            return exact;
    }
    for (const pref of preferences) {
        const matched = models.find((model) => model.toLowerCase().startsWith(pref.toLowerCase()));
        if (matched)
            return matched;
    }
    return '';
}
function isLikelyChatModel(model: string): boolean {
    const normalized = normalizeModel(model).toLowerCase();
    if (!normalized)
        return false;
    if (isPlaceholderModel(normalized))
        return false;
    if (isVoiceDesignTtsModel(normalized))
        return false;
    if (NON_CHAT_MODEL_HINTS.some((hint) => normalized.includes(hint)))
        return false;
    return true;
}
function pickChatModelForConnector(connectors: RuntimeRouteConnectorOption[], connectorId: string, fallbackModel: string): string {
    const matched = connectors.find((item) => item.id === connectorId) || null;
    const target = matched || connectors[0] || null;
    if (!target) {
        const fallback = normalizeModel(fallbackModel);
        return fallback && !isPlaceholderModel(fallback) ? fallback : 'cloud/default';
    }
    const normalizedModels = target.models.map((item) => normalizeModel(item)).filter(Boolean);
    const safeChatModels = normalizedModels.filter((item) => isLikelyChatModel(item));
    if (safeChatModels.length > 0)
        return safeChatModels[0]!;
    const normalizedFallback = normalizeModel(fallbackModel);
    if (normalizedFallback && isLikelyChatModel(normalizedFallback))
        return normalizedFallback;
    return 'cloud/default';
}
function listChatModelsForConnector(connectors: RuntimeRouteConnectorOption[], connectorId: string): string[] {
    const matched = connectors.find((item) => item.id === connectorId) || null;
    if (!matched)
        return [];
    return matched.models
        .map((item) => normalizeModel(item))
        .filter((item, index, array) => Boolean(item) && isLikelyChatModel(item) && array.indexOf(item) === index);
}
function inferProviderDefaultTtsModel(connector: RuntimeRouteConnectorOption | null): string {
    if (!connector)
        return '';
    const signal = `${connector.id} ${connector.label} ${connector.vendor || ''}`.toLowerCase();
    if (signal.includes('dashscope') || signal.includes('alibaba') || signal.includes('qwen')) {
        return 'qwen3-tts-instruct-flash';
    }
    if (signal.includes('openai')) {
        return 'gpt-4o-mini-tts';
    }
    return '';
}
function pickTtsModelForConnector(connectors: RuntimeRouteConnectorOption[], connectorId: string, fallbackModel: string): string {
    const matched = connectors.find((item) => item.id === connectorId) || null;
    const target = matched || connectors[0] || null;
    if (!target)
        return normalizeModel(fallbackModel);
    const normalizedModels = target.models.map((item) => normalizeModel(item)).filter(Boolean);
    const safeModels = normalizedModels.filter((item) => !isVoiceDesignTtsModel(item));
    const signal = `${target.id} ${target.label} ${target.vendor || ''}`.toLowerCase();
    if (signal.includes('dashscope') || signal.includes('alibaba') || signal.includes('qwen')) {
        const preferredDashscope = pickByPreferredPrefix(safeModels, DASHSCOPE_TTS_MODEL_PREFERENCES);
        if (preferredDashscope)
            return preferredDashscope;
    }
    if (signal.includes('openai')) {
        const preferredOpenAi = pickByPreferredPrefix(safeModels, OPENAI_TTS_MODEL_PREFERENCES);
        if (preferredOpenAi)
            return preferredOpenAi;
    }
    const ttsModel = safeModels.find((item) => isLikelyTtsModel(item));
    if (ttsModel)
        return normalizeModel(ttsModel);
    const providerDefault = inferProviderDefaultTtsModel(target);
    if (providerDefault)
        return providerDefault;
    const normalizedFallback = normalizeModel(fallbackModel);
    if (normalizedFallback && !isVoiceDesignTtsModel(normalizedFallback))
        return normalizedFallback;
    if (safeModels.length > 0)
        return normalizeModel(safeModels[0] || '');
    return '';
}
function hasModelOption(options: string[], model?: string): boolean {
    const normalized = normalizeModel(model || '');
    if (!normalized)
        return false;
    return options.includes(normalized);
}
function listTtsModelsForConnector(connectors: RuntimeRouteConnectorOption[], connectorId: string): string[] {
    const matched = connectors.find((item) => item.id === connectorId) || null;
    if (!matched)
        return [];
    return matched.models
        .map((item) => normalizeModel(item))
        .filter((item, index, array) => Boolean(item) && !isVoiceDesignTtsModel(item) && array.indexOf(item) === index);
}
function toSelectionFromResolvedRoute(resolved: {
    source: string;
    connectorId: string;
    model: string;
} | null): RouteSelection {
    if (!resolved) {
        return { ...emptySelection };
    }
    const model = normalizeModel(resolved.model || '');
    if (resolved.source === 'local') {
        return {
            connectorId: '',
            routeSource: 'local',
            ...(model ? { model } : {}),
        };
    }
    if (resolved.source === 'cloud') {
        return {
            connectorId: String(resolved.connectorId || '').trim(),
            routeSource: 'cloud',
            ...(model ? { model } : {}),
        };
    }
    return { ...emptySelection };
}
function toBindingFromResolvedRoute(resolved: {
    source: string;
    connectorId: string;
    model: string;
} | null) {
    const normalizedModel = normalizeModel(resolved?.model || '');
    if (!resolved || !normalizedModel) {
        return null;
    }
    if (resolved.source === 'local') {
        return {
            source: 'local' as const,
            connectorId: '',
            model: normalizedModel,
        };
    }
    if (resolved.source === 'cloud' && String(resolved.connectorId || '').trim()) {
        return {
            source: 'cloud' as const,
            connectorId: String(resolved.connectorId || '').trim(),
            model: normalizedModel,
        };
    }
    return null;
}
function hasMeaningfulSelection(selection: RouteSelection | null | undefined): boolean {
    if (!selection) {
        return false;
    }
    return Boolean(
        String(selection.connectorId || '').trim()
        || String(selection.model || '').trim()
        || selection.routeSource === 'local'
        || selection.routeSource === 'cloud',
    );
}
function resolveSelection(connectors: RuntimeRouteConnectorOption[], preferred: RouteSelection, fallback: RouteSelectionFallback, modelPicker: (connectors: RuntimeRouteConnectorOption[], connectorId: string, fallbackModel: string) => string, modelOptionsGetter: (connectors: RuntimeRouteConnectorOption[], connectorId: string) => string[]): RouteSelection {
    if (preferred.routeSource === 'local') {
        return {
            connectorId: '',
            routeSource: 'local',
            ...(normalizeModel(preferred.model || fallback.model || '') ? { model: normalizeModel(preferred.model || fallback.model || '') } : {}),
        };
    }
    if (preferred.connectorId && connectors.some((c) => c.id === preferred.connectorId)) {
        const options = modelOptionsGetter(connectors, preferred.connectorId);
        const preferredModel = hasModelOption(options, preferred.model)
            ? normalizeModel(preferred.model || '')
            : '';
        return {
            connectorId: preferred.connectorId,
            routeSource: 'cloud',
            model: preferredModel || modelPicker(connectors, preferred.connectorId, fallback.model || ''),
        };
    }
    if (fallback.connectorId && connectors.some((c) => c.id === fallback.connectorId)) {
        const options = modelOptionsGetter(connectors, fallback.connectorId);
        const nextModel = hasModelOption(options, fallback.model)
            ? normalizeModel(fallback.model)
            : modelPicker(connectors, fallback.connectorId, fallback.model || '');
        return {
            connectorId: fallback.connectorId,
            routeSource: 'cloud',
            model: nextModel || undefined,
        };
    }
    if (connectors.length > 0) {
        const first = connectors[0]?.id || '';
        if (!first) {
            return { connectorId: '', routeSource: 'auto', model: fallback.model || undefined };
        }
        const nextModel = modelPicker(connectors, first, fallback.model || '');
        return {
            connectorId: first,
            routeSource: 'cloud',
            model: nextModel || undefined,
        };
    }
    if (fallback.connectorId) {
        return {
            connectorId: fallback.connectorId,
            routeSource: 'cloud',
            model: fallback.model || undefined,
        };
    }
    if (normalizeModel(preferred.model || '')) {
        return {
            connectorId: '',
            routeSource: preferred.routeSource,
            model: normalizeModel(preferred.model || '') || undefined,
        };
    }
    return { connectorId: '', routeSource: 'auto', model: undefined };
}
// ---------------------------------------------------------------------------
// Main hook
// ---------------------------------------------------------------------------
export function useTtsRoute(runtimeClient: ModRuntimeClient): TtsRouteState {
    const [chatConnectors, setChatConnectors] = useState<RuntimeRouteConnectorOption[]>([]);
    const [ttsConnectors, setTtsConnectors] = useState<RuntimeRouteConnectorOption[]>([]);
    const [aiConfig, setAiConfig] = useState<AIConfig>(() => createEmptyAIConfig(AUDIO_BOOK_AI_SCOPE_REF));
    const [chatSelection, setChatSelection] = useState<RouteSelection>(() => ({ ...emptySelection }));
    const [ttsSelection, setTtsSelection] = useState<RouteSelection>(() => ({ ...emptySelection }));
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const loadInFlightRef = useRef(new Map<RuntimeCanonicalCapability, Promise<RuntimeRouteOptionsSnapshot | null>>());
    const legacySelectionsRef = useRef<{
        chatSelection: RouteSelection;
        ttsSelection: RouteSelection;
    }>({
        chatSelection: { ...emptySelection },
        ttsSelection: { ...emptySelection },
    });
    const latestRouteStateRef = useRef<{
        chatSnapshot: RuntimeRouteOptionsSnapshot | null;
        ttsSnapshot: RuntimeRouteOptionsSnapshot | null;
        resolvedChat: {
            source: string;
            connectorId: string;
            model: string;
        } | null;
        resolvedTts: {
            source: string;
            connectorId: string;
            model: string;
        } | null;
    }>({
        chatSnapshot: null,
        ttsSnapshot: null,
        resolvedChat: null,
        resolvedTts: null,
    });
    const legacyClearedRef = useRef(false);
    const loadRouteOptionsDeduped = useCallback(async (capability: RuntimeCanonicalCapability): Promise<RuntimeRouteOptionsSnapshot | null> => {
        const existing = loadInFlightRef.current.get(capability);
        if (existing) {
            return existing;
        }
        const task = loadRouteOptions(runtimeClient, capability);
        loadInFlightRef.current.set(capability, task);
        void task.finally(() => {
            if (loadInFlightRef.current.get(capability) === task) {
                loadInFlightRef.current.delete(capability);
            }
        });
        return task;
    }, [runtimeClient]);
    const syncSelections = useCallback((input: {
        config: AIConfig;
        chatSnapshot: RuntimeRouteOptionsSnapshot | null;
        ttsSnapshot: RuntimeRouteOptionsSnapshot | null;
        resolvedChat: {
            source: string;
            connectorId: string;
            model: string;
        } | null;
        resolvedTts: {
            source: string;
            connectorId: string;
            model: string;
        } | null;
    }) => {
        const chatBinding = getAudioBookCapabilityBinding(input.config, 'text.generate');
        const ttsBinding = getAudioBookCapabilityBinding(input.config, 'audio.synthesize');
        const nextChatConnectors = input.chatSnapshot?.connectors || [];
        const nextTtsConnectors = input.ttsSnapshot?.connectors || [];
        setChatConnectors(nextChatConnectors);
        setTtsConnectors(nextTtsConnectors);
        setChatSelection(resolveSelection(
            nextChatConnectors,
            deriveAudioBookRouteSelection(chatBinding, input.chatSnapshot),
            {
                connectorId: toSelectionFromResolvedRoute(input.resolvedChat).connectorId,
                model: toSelectionFromResolvedRoute(input.resolvedChat).model || '',
            },
            pickChatModelForConnector,
            listChatModelsForConnector,
        ));
        setTtsSelection(resolveSelection(
            nextTtsConnectors,
            deriveAudioBookRouteSelection(ttsBinding, input.ttsSnapshot),
            {
                connectorId: toSelectionFromResolvedRoute(input.resolvedTts).connectorId,
                model: toSelectionFromResolvedRoute(input.resolvedTts).model || '',
            },
            pickTtsModelForConnector,
            listTtsModelsForConnector,
        ));
    }, []);
    const ensureAuthorityBindings = useCallback((input: {
        config: AIConfig;
        chatSnapshot: RuntimeRouteOptionsSnapshot | null;
        ttsSnapshot: RuntimeRouteOptionsSnapshot | null;
        resolvedChat: {
            source: string;
            connectorId: string;
            model: string;
        } | null;
        resolvedTts: {
            source: string;
            connectorId: string;
            model: string;
        } | null;
    }): AIConfig => {
        let nextConfig = input.config;
        if (!getAudioBookCapabilityBinding(nextConfig, 'text.generate')) {
            const legacySelection = hasMeaningfulSelection(legacySelectionsRef.current.chatSelection)
                ? legacySelectionsRef.current.chatSelection
                : null;
            const hydrated = hydrateAudioBookCapabilityBinding(
                runtimeClient,
                'text.generate',
                input.chatSnapshot,
                legacySelection,
            ) || toBindingFromResolvedRoute(input.resolvedChat);
            if (hydrated && !getAudioBookCapabilityBinding(nextConfig, 'text.generate')) {
                nextConfig = getAudioBookCapabilityBinding(getAudioBookAIConfig(runtimeClient), 'text.generate')
                    ? getAudioBookAIConfig(runtimeClient)
                    : updateAudioBookCapabilityBinding(runtimeClient, 'text.generate', hydrated);
            }
        }
        if (!getAudioBookCapabilityBinding(nextConfig, 'audio.synthesize')) {
            const legacySelection = hasMeaningfulSelection(legacySelectionsRef.current.ttsSelection)
                ? legacySelectionsRef.current.ttsSelection
                : null;
            const hydrated = hydrateAudioBookCapabilityBinding(
                runtimeClient,
                'audio.synthesize',
                input.ttsSnapshot,
                legacySelection,
            ) || toBindingFromResolvedRoute(input.resolvedTts);
            if (hydrated && !getAudioBookCapabilityBinding(nextConfig, 'audio.synthesize')) {
                nextConfig = getAudioBookCapabilityBinding(getAudioBookAIConfig(runtimeClient), 'audio.synthesize')
                    ? getAudioBookAIConfig(runtimeClient)
                    : updateAudioBookCapabilityBinding(runtimeClient, 'audio.synthesize', hydrated);
            }
        }
        const chatReady = getAudioBookCapabilityBinding(nextConfig, 'text.generate') || !hasMeaningfulSelection(legacySelectionsRef.current.chatSelection);
        const ttsReady = getAudioBookCapabilityBinding(nextConfig, 'audio.synthesize') || !hasMeaningfulSelection(legacySelectionsRef.current.ttsSelection);
        if (!legacyClearedRef.current && chatReady && ttsReady) {
            legacyClearedRef.current = true;
            void clearLegacyAudioBookRouteSelections();
        }
        return nextConfig;
    }, [runtimeClient]);
    useEffect(() => {
        setAiConfig(getAudioBookAIConfig(runtimeClient));
        return subscribeAudioBookAIConfig(runtimeClient, (config) => {
            setAiConfig(config);
        });
    }, [runtimeClient]);
    useEffect(() => {
        const latest = latestRouteStateRef.current;
        if (!latest.chatSnapshot && !latest.ttsSnapshot && !latest.resolvedChat && !latest.resolvedTts) {
            return;
        }
        syncSelections({
            config: aiConfig,
            chatSnapshot: latest.chatSnapshot,
            ttsSnapshot: latest.ttsSnapshot,
            resolvedChat: latest.resolvedChat,
            resolvedTts: latest.resolvedTts,
        });
    }, [aiConfig, syncSelections]);
    useEffect(() => {
        let cancelled = false;
        async function init() {
            legacySelectionsRef.current = await readLegacyAudioBookRouteSelections();
            if (cancelled)
                return;
            let currentConfig = getAudioBookAIConfig(runtimeClient);
            setAiConfig(currentConfig);
            const [resolvedChat, resolvedTts] = await Promise.all([
                resolveRouteBinding(runtimeClient, 'text.generate'),
                resolveRouteBinding(runtimeClient, 'audio.synthesize'),
            ]);
            if (cancelled)
                return;
            const resolvedChatConnectorId = resolvedChat?.connectorId || '';
            const resolvedChatModel = resolvedChat?.model || '';
            const resolvedTtsConnectorId = resolvedTts?.connectorId || '';
            const resolvedTtsModel = resolvedTts?.model || '';
            for (const delayMs of RETRY_DELAYS_MS) {
                if (cancelled)
                    return;
                if (delayMs > 0) {
                    await new Promise<void>((r) => setTimeout(r, delayMs));
                    if (cancelled)
                        return;
                }
                const [chatSnapshot, ttsSnapshot] = await Promise.all([
                    loadRouteOptionsDeduped('text.generate'),
                    loadRouteOptionsDeduped('audio.synthesize'),
                ]);
                if (chatSnapshot || ttsSnapshot) {
                    if (cancelled)
                        return;
                    currentConfig = ensureAuthorityBindings({
                        config: currentConfig,
                        chatSnapshot,
                        ttsSnapshot,
                        resolvedChat,
                        resolvedTts,
                    });
                    setAiConfig(currentConfig);
                    latestRouteStateRef.current = {
                        chatSnapshot,
                        ttsSnapshot,
                        resolvedChat,
                        resolvedTts,
                    };
                    syncSelections({
                        config: currentConfig,
                        chatSnapshot,
                        ttsSnapshot,
                        resolvedChat,
                        resolvedTts,
                    });
                    console.info(LOG_PREFIX, 'init:loaded', {
                        chatConnectorsCount: chatSnapshot?.connectors.length || 0,
                        selectedChatConnectorId: getAudioBookCapabilityBinding(currentConfig, 'text.generate')?.connectorId || '(none)',
                        selectedChatModel: getAudioBookCapabilityBinding(currentConfig, 'text.generate')?.model || '(none)',
                        ttsConnectorsCount: ttsSnapshot?.connectors.length || 0,
                        selectedTtsConnectorId: getAudioBookCapabilityBinding(currentConfig, 'audio.synthesize')?.connectorId || '(none)',
                        resolvedTtsModel: resolvedTtsModel || '(none)',
                        selectedTtsModel: getAudioBookCapabilityBinding(currentConfig, 'audio.synthesize')?.model || '(none)',
                    });
                    setError(null);
                    setLoading(false);
                    return;
                }
            }
            // All retries failed — still use resolvedConnectorId if available
            if (!cancelled) {
                currentConfig = ensureAuthorityBindings({
                    config: currentConfig,
                    chatSnapshot: null,
                    ttsSnapshot: null,
                    resolvedChat,
                    resolvedTts,
                });
                setAiConfig(currentConfig);
                latestRouteStateRef.current = {
                    chatSnapshot: null,
                    ttsSnapshot: null,
                    resolvedChat,
                    resolvedTts,
                };
                syncSelections({
                    config: currentConfig,
                    chatSnapshot: null,
                    ttsSnapshot: null,
                    resolvedChat,
                    resolvedTts,
                });
                console.warn(LOG_PREFIX, 'init:all-retries-failed', {
                    resolvedChatConnectorId: resolvedChatConnectorId || '(none)',
                    resolvedTtsConnectorId: resolvedTtsConnectorId || '(none)',
                });
                setError(resolvedChatConnectorId || resolvedTtsConnectorId ? null : 'Failed to load route options');
                setLoading(false);
            }
        }
        init();
        return () => { cancelled = true; };
    }, [ensureAuthorityBindings, loadRouteOptionsDeduped, runtimeClient, syncSelections]);
    useEffect(() => {
        const hasConnectors = chatConnectors.length > 0 || ttsConnectors.length > 0;
        const intervalMs = hasConnectors ? POLL_INTERVAL_WITH_CONNECTORS_MS : POLL_INTERVAL_WITHOUT_CONNECTORS_MS;
        const timer = setInterval(async () => {
            const [resolvedChat, resolvedTts] = await Promise.all([
                resolveRouteBinding(runtimeClient, 'text.generate'),
                resolveRouteBinding(runtimeClient, 'audio.synthesize'),
            ]);
            const [chatSnapshot, ttsSnapshot] = await Promise.all([
                loadRouteOptionsDeduped('text.generate'),
                loadRouteOptionsDeduped('audio.synthesize'),
            ]);
            const nextConfig = ensureAuthorityBindings({
                config: getAudioBookAIConfig(runtimeClient),
                chatSnapshot,
                ttsSnapshot,
                resolvedChat,
                resolvedTts,
            });
            setAiConfig(nextConfig);
            latestRouteStateRef.current = {
                chatSnapshot,
                ttsSnapshot,
                resolvedChat,
                resolvedTts,
            };
            syncSelections({
                config: nextConfig,
                chatSnapshot,
                ttsSnapshot,
                resolvedChat,
                resolvedTts,
            });
            if (chatSnapshot && ttsSnapshot) {
                setError(null);
            }
        }, intervalMs);
        return () => clearInterval(timer);
    }, [
        chatConnectors.length,
        ensureAuthorityBindings,
        loadRouteOptionsDeduped,
        runtimeClient,
        syncSelections,
        ttsConnectors.length,
    ]);
    useEffect(() => {
        if (!ttsSelection.connectorId || ttsSelection.routeSource !== 'cloud')
            return;
        let cancelled = false;
        async function syncSelectedTtsModel() {
            const resolved = await resolveRouteBinding(runtimeClient, 'audio.synthesize', ttsSelection);
            if (cancelled)
                return;
            const resolvedModel = String(resolved?.model || '').trim();
            const preferredModel = pickTtsModelForConnector(ttsConnectors, ttsSelection.connectorId, resolvedModel);
            const resolvedIsUsable = resolvedModel
                && !isPlaceholderModel(resolvedModel)
                && !isVoiceDesignTtsModel(resolvedModel);
            const nextModel = preferredModel || (resolvedIsUsable ? resolvedModel : '');
            if (!nextModel)
                return;
            setTtsSelection((previous) => {
                if (previous.connectorId !== ttsSelection.connectorId)
                    return previous;
                if (previous.model === nextModel)
                    return previous;
                const next: RouteSelection = { ...previous, model: nextModel };
                const nextBinding = materializeAudioBookBinding(
                    next,
                    latestRouteStateRef.current.ttsSnapshot || null,
                );
                if (nextBinding) {
                    const nextConfig = updateAudioBookCapabilityBinding(runtimeClient, 'audio.synthesize', nextBinding);
                    setAiConfig(nextConfig);
                }
                return next;
            });
        }
        void syncSelectedTtsModel();
        return () => { cancelled = true; };
    }, [runtimeClient, ttsConnectors, ttsSelection.connectorId, ttsSelection.model, ttsSelection.routeSource]);
    const selectChatConnector = useCallback((connectorId: string) => {
        const nextModel = connectorId
            ? pickChatModelForConnector(chatConnectors, connectorId, chatSelection.model || '')
            : undefined;
        const selection: RouteSelection = {
            connectorId,
            routeSource: connectorId ? 'cloud' : 'auto',
            model: connectorId ? nextModel : undefined,
        };
        const nextBinding = materializeAudioBookBinding(
            selection,
            latestRouteStateRef.current.chatSnapshot || null,
        );
        setChatSelection(selection);
        if (nextBinding) {
            const nextConfig = updateAudioBookCapabilityBinding(runtimeClient, 'text.generate', nextBinding);
            setAiConfig(nextConfig);
        }
    }, [chatConnectors, chatSelection.model, runtimeClient]);
    const selectChatModel = useCallback((model: string) => {
        const nextModel = normalizeModel(model);
        setChatSelection((previous) => {
            if (!previous.connectorId)
                return previous;
            const availableModels = listChatModelsForConnector(chatConnectors, previous.connectorId);
            const resolvedModel = hasModelOption(availableModels, nextModel)
                ? nextModel
                : pickChatModelForConnector(chatConnectors, previous.connectorId, previous.model || '');
            const next: RouteSelection = {
                ...previous,
                model: resolvedModel || undefined,
            };
            const nextBinding = materializeAudioBookBinding(
                next,
                latestRouteStateRef.current.chatSnapshot || null,
            );
            if (nextBinding) {
                const nextConfig = updateAudioBookCapabilityBinding(runtimeClient, 'text.generate', nextBinding);
                setAiConfig(nextConfig);
            }
            return next;
        });
    }, [chatConnectors, runtimeClient]);
    const selectTtsConnector = useCallback((connectorId: string) => {
        const nextModel = connectorId
            ? pickTtsModelForConnector(ttsConnectors, connectorId, ttsSelection.model || '')
            : undefined;
        const selection: RouteSelection = {
            connectorId,
            routeSource: connectorId ? 'cloud' : 'auto',
            model: connectorId ? nextModel : undefined,
        };
        const nextBinding = materializeAudioBookBinding(
            selection,
            latestRouteStateRef.current.ttsSnapshot || null,
        );
        setTtsSelection(selection);
        if (nextBinding) {
            const nextConfig = updateAudioBookCapabilityBinding(runtimeClient, 'audio.synthesize', nextBinding);
            setAiConfig(nextConfig);
        }
    }, [runtimeClient, ttsConnectors, ttsSelection.model]);
    const chatBinding = getAudioBookCapabilityBinding(aiConfig, 'text.generate');
    const ttsBinding = getAudioBookCapabilityBinding(aiConfig, 'audio.synthesize');
    return useMemo(() => ({
        chatConnectors,
        ttsConnectors,
        chatBinding,
        ttsBinding,
        chatSelection,
        ttsSelection,
        loading,
        error,
        selectChatConnector,
        selectChatModel,
        selectTtsConnector,
    }), [chatConnectors, ttsConnectors, chatBinding, ttsBinding, chatSelection, ttsSelection, loading, error, selectChatConnector, selectChatModel, selectTtsConnector]);
}
