import { useCallback, useEffect, useRef, useState } from 'react';
import { loadLocalChatRouteBinding, persistLocalChatRouteBinding, } from '../services/route/route-override-store.js';
import { emitLocalChatLog } from '../logging.js';
import { resolveLocalRuntimeModelsForScenario, resolveModelsForScenario, } from '../services/route/connector-model-capabilities.js';
import type { HealthStatus } from '../types.js';
import { buildRouteBindingForConnector, buildRouteBindingForModel, buildRouteBindingForSource } from './runtime-route/override-actions.js';
import { loadRouteOptions, resolveRouteSnapshot, runRouteHealthCheck } from './runtime-route/queries.js';
import type { ChatRouteSnapshot, UseLocalChatRuntimeRouteInput } from './runtime-route/types.js';
import { type RuntimeRouteBinding, type RuntimeCanonicalCapability, type RuntimeRouteOptionsSnapshot, type RuntimeRouteSource } from "@nimiplatform/sdk/mod";
type RouteCapability = RuntimeCanonicalCapability;
type RouteOptionsCapability = 'text.generate' | 'image.generate' | 'video.generate' | 'audio.synthesize' | 'audio.transcribe';
const ALL_ROUTE_OPTIONS_CAPABILITIES: RouteOptionsCapability[] = [
    'text.generate',
    'image.generate',
    'video.generate',
    'audio.synthesize',
    'audio.transcribe',
];
const SECONDARY_ROUTE_OPTIONS_CAPABILITIES: RouteOptionsCapability[] = ALL_ROUTE_OPTIONS_CAPABILITIES.filter((capability) => capability !== 'text.generate');
const MEDIA_ROUTE_OPTIONS_CAPABILITIES: RouteOptionsCapability[] = [
    'image.generate',
    'video.generate',
];
const VOICE_ROUTE_OPTIONS_CAPABILITIES: RouteOptionsCapability[] = [
    'audio.synthesize',
    'audio.transcribe',
];
const ROUTE_SNAPSHOT_FOCUS_DEBOUNCE_MS = 10000;
export function resolveRequestedRouteOptionsCapabilities(input: {
    requestedCapabilities?: Iterable<RouteOptionsCapability> | null;
}): RouteOptionsCapability[] {
    const requested = new Set(input.requestedCapabilities || ['text.generate']);
    return ALL_ROUTE_OPTIONS_CAPABILITIES.filter((capability) => requested.has(capability));
}
export function shouldSkipRouteSnapshotRefresh(input: {
    lastCompletedAtMs?: number | null;
    nowMs?: number;
    debounceMs?: number;
}): boolean {
    const lastCompletedAtMs = Number(input.lastCompletedAtMs || 0);
    if (!Number.isFinite(lastCompletedAtMs) || lastCompletedAtMs <= 0) {
        return false;
    }
    const nowMs = Number.isFinite(input.nowMs) ? Number(input.nowMs) : Date.now();
    const debounceMs = Number.isFinite(input.debounceMs) ? Math.max(0, Number(input.debounceMs)) : ROUTE_SNAPSHOT_FOCUS_DEBOUNCE_MS;
    return (nowMs - lastCompletedAtMs) < debounceMs;
}
export function hasValidTokenApiChatModelSelection(input: {
    model: string;
    models: string[];
    modelCapabilities?: Record<string, string[]>;
}): boolean {
    const model = String(input.model || '').trim();
    if (!model) {
        return false;
    }
    return resolveModelsForScenario({
        models: input.models,
        modelCapabilities: input.modelCapabilities,
        scenario: 'text.generate',
    }).includes(model);
}
export function hasValidLocalRuntimeChatModelSelection(input: {
    model: string;
    localModelId?: string;
    models: Array<{
        localModelId?: string;
        model: string;
        capabilities?: string[];
    }>;
}): boolean {
    const model = String(input.model || '').trim();
    const localModelId = String(input.localModelId || '').trim();
    if (!model && !localModelId) {
        return false;
    }
    return resolveLocalRuntimeModelsForScenario({
        models: input.models,
        scenario: 'text.generate',
    }).some((candidate) => (String(candidate.model || '').trim() === model
        || String(candidate.localModelId || '').trim() === localModelId));
}
export function useLocalChatRuntimeRoute(input: UseLocalChatRuntimeRouteInput) {
    const [healthStatus, setHealthStatus] = useState<HealthStatus>('idle');
    const [checkingHealth, setCheckingHealth] = useState(false);
    const [routeSnapshot, setRouteSnapshot] = useState<ChatRouteSnapshot | null>(null);
    const [chatRouteOptions, setChatRouteOptions] = useState<RuntimeRouteOptionsSnapshot | null>(null);
    const [imageRouteOptions, setImageRouteOptions] = useState<RuntimeRouteOptionsSnapshot | null>(null);
    const [videoRouteOptions, setVideoRouteOptions] = useState<RuntimeRouteOptionsSnapshot | null>(null);
    const [ttsRouteOptions, setTtsRouteOptions] = useState<RuntimeRouteOptionsSnapshot | null>(null);
    const [sttRouteOptions, setSttRouteOptions] = useState<RuntimeRouteOptionsSnapshot | null>(null);
    const [routeBinding, setRouteBinding] = useState<RuntimeRouteBinding | null>(null);
    const [routeBindingHydrated, setRouteBindingHydrated] = useState(false);
    const [requestedCapabilitiesRevision, setRequestedCapabilitiesRevision] = useState(0);
    const routeOptionsLoadInFlightRef = useRef<Partial<Record<RouteOptionsCapability, Promise<RuntimeRouteOptionsSnapshot | null>>>>({});
    const requestedCapabilitiesRef = useRef<Set<RouteOptionsCapability>>(new Set(['text.generate']));
    const lastRouteSnapshotCompletedAtRef = useRef<number | null>(null);
    const markRouteOptionsRequested = useCallback((capabilities: RouteOptionsCapability[]) => {
        let changed = false;
        capabilities.forEach((capability) => {
            if (!requestedCapabilitiesRef.current.has(capability)) {
                requestedCapabilitiesRef.current.add(capability);
                changed = true;
            }
        });
        if (changed) {
            setRequestedCapabilitiesRevision((previous) => previous + 1);
        }
    }, []);
    const setRouteOptionsSafely = useCallback((capability: RouteOptionsCapability, next: RuntimeRouteOptionsSnapshot | null) => {
        if (capability === 'text.generate') {
            setChatRouteOptions((previous) => {
                if (!next) {
                    return previous;
                }
                if (next.connectors.length === 0 && (previous?.connectors.length || 0) > 0) {
                    return previous;
                }
                return next;
            });
            return;
        }
        if (capability === 'audio.synthesize') {
            setTtsRouteOptions(next);
            return;
        }
        if (capability === 'image.generate') {
            setImageRouteOptions(next);
            return;
        }
        if (capability === 'video.generate') {
            setVideoRouteOptions(next);
            return;
        }
        if (capability === 'audio.transcribe') {
            setSttRouteOptions(next);
            return;
        }
    }, []);
    const refreshRouteSnapshot = useCallback(async (options?: {
        force?: boolean;
    }) => {
        if (!options?.force && shouldSkipRouteSnapshotRefresh({
            lastCompletedAtMs: lastRouteSnapshotCompletedAtRef.current,
        })) {
            return false;
        }
        const refreshed = await resolveRouteSnapshot({
            runtimeClient: input.runtimeClient,
            routeBinding,
            setRouteSnapshot,
            setStatusBanner: input.setStatusBanner,
        });
        if (refreshed) {
            lastRouteSnapshotCompletedAtRef.current = Date.now();
        }
        return refreshed;
    }, [input.runtimeClient, input.setStatusBanner, routeBinding]);
    const loadRuntimeRouteOptions = useCallback(async (capability: RouteOptionsCapability) => {
        markRouteOptionsRequested([capability]);
        const inFlight = routeOptionsLoadInFlightRef.current[capability];
        if (inFlight) {
            emitLocalChatLog({
                level: 'debug',
                message: `action:local-chat:route-options:${capability}:load:reuse-inflight`,
                source: 'useLocalChatRuntimeRoute',
            });
            return inFlight;
        }
        const task = (async () => {
            emitLocalChatLog({
                level: 'debug',
                message: `action:local-chat:route-options:${capability}:load:start`,
                source: 'useLocalChatRuntimeRoute',
            });
            const loaded = await loadRouteOptions({
                capability,
                runtimeClient: input.runtimeClient,
                setRouteOptions: (value) => setRouteOptionsSafely(capability, value),
            });
            emitLocalChatLog({
                level: 'debug',
                message: `action:local-chat:route-options:${capability}:load:done`,
                source: 'useLocalChatRuntimeRoute',
                details: {
                    capability,
                    loaded: Boolean(loaded),
                    connectorsCount: loaded?.connectors.length ?? 0,
                    selectedSource: loaded?.selected?.source ?? null,
                    selectedConnectorId: loaded?.selected?.connectorId || null,
                },
            });
            return loaded;
        })();
        routeOptionsLoadInFlightRef.current[capability] = task;
        void task.finally(() => {
            if (routeOptionsLoadInFlightRef.current[capability] === task) {
                delete routeOptionsLoadInFlightRef.current[capability];
            }
        });
        return task;
    }, [input.runtimeClient, markRouteOptionsRequested, setRouteOptionsSafely]);
    const loadChatRuntimeRouteOptions = useCallback(() => loadRuntimeRouteOptions('text.generate'), [loadRuntimeRouteOptions]);
    const loadTtsRuntimeRouteOptions = useCallback(() => loadRuntimeRouteOptions('audio.synthesize'), [loadRuntimeRouteOptions]);
    const loadSttRuntimeRouteOptions = useCallback(() => loadRuntimeRouteOptions('audio.transcribe'), [loadRuntimeRouteOptions]);
    const loadImageRuntimeRouteOptions = useCallback(() => loadRuntimeRouteOptions('image.generate'), [loadRuntimeRouteOptions]);
    const loadVideoRuntimeRouteOptions = useCallback(() => loadRuntimeRouteOptions('video.generate'), [loadRuntimeRouteOptions]);
    const loadRouteOptionsSet = useCallback(async (capabilities: RouteOptionsCapability[]) => {
        // Sequential loading: each call triggers a state update + re-render.
        // Running them in parallel (Promise.all) causes 5 gRPC responses to land
        // in the same frame, flooding the main thread with state updates and
        // re-renders — this was the root cause of the app-wide UI stalls.
        const requestedCapabilities = resolveRequestedRouteOptionsCapabilities({
            requestedCapabilities: capabilities,
        });
        let chat: RuntimeRouteOptionsSnapshot | null = null;
        let image: RuntimeRouteOptionsSnapshot | null = null;
        let video: RuntimeRouteOptionsSnapshot | null = null;
        let tts: RuntimeRouteOptionsSnapshot | null = null;
        let stt: RuntimeRouteOptionsSnapshot | null = null;
        for (const capability of requestedCapabilities) {
            const loaded = await loadRuntimeRouteOptions(capability);
            if (capability === 'text.generate') {
                chat = loaded;
                continue;
            }
            if (capability === 'image.generate') {
                image = loaded;
                continue;
            }
            if (capability === 'video.generate') {
                video = loaded;
                continue;
            }
            if (capability === 'audio.synthesize') {
                tts = loaded;
                continue;
            }
            if (capability === 'audio.transcribe') {
                stt = loaded;
            }
        }
        return { chat, image, video, tts, stt };
    }, [
        loadRuntimeRouteOptions,
    ]);
    const loadVoiceRuntimeRouteOptions = useCallback(() => loadRouteOptionsSet(VOICE_ROUTE_OPTIONS_CAPABILITIES), [loadRouteOptionsSet]);
    const loadMediaRuntimeRouteOptions = useCallback(() => loadRouteOptionsSet(MEDIA_ROUTE_OPTIONS_CAPABILITIES), [loadRouteOptionsSet]);
    const loadSecondaryRuntimeRouteOptions = useCallback(() => loadRouteOptionsSet(SECONDARY_ROUTE_OPTIONS_CAPABILITIES), [loadRouteOptionsSet]);
    const loadAllRuntimeRouteOptions = useCallback(() => loadRouteOptionsSet(ALL_ROUTE_OPTIONS_CAPABILITIES), [loadRouteOptionsSet]);
    const requestedCapabilities = resolveRequestedRouteOptionsCapabilities({
        requestedCapabilities: requestedCapabilitiesRef.current,
    });
    const handleHealthCheck = useCallback(async () => {
        await runRouteHealthCheck({
            runtimeClient: input.runtimeClient,
            routeBinding,
            setCheckingHealth,
            setHealthStatus,
            setStatusBanner: input.setStatusBanner,
        });
    }, [input.runtimeClient, input.setStatusBanner, routeBinding]);
    const handleRouteSourceChange = useCallback((source: RuntimeRouteSource) => {
        setRouteBinding((previous) => buildRouteBindingForSource({
            source,
            previous,
            options: chatRouteOptions,
        }));
    }, [chatRouteOptions]);
    const handleRouteConnectorChange = useCallback((connectorId: string) => {
        setRouteBinding((previous) => buildRouteBindingForConnector({
            connectorId,
            previous,
            options: chatRouteOptions,
        }));
    }, [chatRouteOptions]);
    const handleRouteModelChange = useCallback((model: string) => {
        setRouteBinding((previous) => buildRouteBindingForModel({
            model,
            previous,
            options: chatRouteOptions,
        }));
    }, [chatRouteOptions]);
    const clearRouteBinding = useCallback(() => {
        setRouteBinding(null);
    }, []);
    useEffect(() => {
        let cancelled = false;
        void loadLocalChatRouteBinding().then((value) => {
            if (cancelled) {
                return;
            }
            setRouteBinding(value);
            setRouteBindingHydrated(true);
        }).catch(() => {
            if (!cancelled) {
                setRouteBindingHydrated(true);
            }
        });
        return () => {
            cancelled = true;
        };
    }, []);
    useEffect(() => {
        if (!routeBindingHydrated) {
            return;
        }
        void persistLocalChatRouteBinding(routeBinding);
    }, [routeBinding, routeBindingHydrated]);
    useEffect(() => {
        void refreshRouteSnapshot({ force: true });
    }, [refreshRouteSnapshot]);
    useEffect(() => {
        let cancelled = false;
        const loadWithRetry = async () => {
            const retryDelayMs = [0, 200, 500, 1000];
            for (const delayMs of retryDelayMs) {
                if (cancelled)
                    return;
                if (delayMs > 0) {
                    await new Promise<void>((resolve) => {
                        setTimeout(() => resolve(), delayMs);
                    });
                    if (cancelled)
                        return;
                }
                let loaded: RuntimeRouteOptionsSnapshot | null = null;
                try {
                    loaded = await loadChatRuntimeRouteOptions();
                }
                catch {
                    loaded = null;
                }
                if (loaded) {
                    return;
                }
            }
        };
        void loadWithRetry();
        return () => {
            cancelled = true;
        };
    }, [loadChatRuntimeRouteOptions]);
    useEffect(() => {
        const connectorCount = Math.max(...requestedCapabilities.map((capability) => {
            if (capability === 'text.generate') {
                return chatRouteOptions?.connectors.length || 0;
            }
            if (capability === 'image.generate') {
                return imageRouteOptions?.connectors.length || 0;
            }
            if (capability === 'video.generate') {
                return videoRouteOptions?.connectors.length || 0;
            }
            if (capability === 'audio.synthesize') {
                return ttsRouteOptions?.connectors.length || 0;
            }
            return sttRouteOptions?.connectors.length || 0;
        }), 0);
        const pollIntervalMs = connectorCount > 0 ? 30000 : 60000;
        const timer = setInterval(() => {
            void loadRouteOptionsSet(requestedCapabilities);
        }, pollIntervalMs);
        return () => {
            clearInterval(timer);
        };
    }, [
        requestedCapabilitiesRevision,
        chatRouteOptions?.connectors.length,
        imageRouteOptions?.connectors.length,
        videoRouteOptions?.connectors.length,
        ttsRouteOptions?.connectors.length,
        sttRouteOptions?.connectors.length,
        loadRouteOptionsSet,
    ]);
    return {
        healthStatus,
        checkingHealth,
        routeSnapshot,
        chatRouteOptions,
        imageRouteOptions,
        videoRouteOptions,
        ttsRouteOptions,
        sttRouteOptions,
        routeOptionsByCapability: {
            'text.generate': chatRouteOptions,
            'image.generate': imageRouteOptions,
            'video.generate': videoRouteOptions,
            'audio.synthesize': ttsRouteOptions,
            'audio.transcribe': sttRouteOptions,
        },
        routeBinding,
        loadChatRuntimeRouteOptions,
        loadImageRuntimeRouteOptions,
        loadVideoRuntimeRouteOptions,
        loadTtsRuntimeRouteOptions,
        loadSttRuntimeRouteOptions,
        loadMediaRuntimeRouteOptions,
        loadVoiceRuntimeRouteOptions,
        loadSecondaryRuntimeRouteOptions,
        loadAllRuntimeRouteOptions,
        refreshRouteSnapshot,
        handleHealthCheck,
        handleRouteSourceChange,
        handleRouteConnectorChange,
        handleRouteModelChange,
        clearRouteBinding,
    };
}
