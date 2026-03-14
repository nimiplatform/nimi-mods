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
    const routeOptionsLoadInFlightRef = useRef<Partial<Record<RouteOptionsCapability, Promise<RuntimeRouteOptionsSnapshot | null>>>>({});
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
    const refreshRouteSnapshot = useCallback(async () => {
        await resolveRouteSnapshot({
            runtimeClient: input.runtimeClient,
            routeBinding,
            setRouteSnapshot,
            setStatusBanner: input.setStatusBanner,
        });
    }, [input.runtimeClient, input.setStatusBanner, routeBinding]);
    const loadRuntimeRouteOptions = useCallback(async (capability: RouteOptionsCapability) => {
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
                    selectedSource: loaded?.selected.source ?? null,
                    selectedConnectorId: loaded?.selected.connectorId || null,
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
    }, [input.runtimeClient, setRouteOptionsSafely]);
    const loadChatRuntimeRouteOptions = useCallback(() => loadRuntimeRouteOptions('text.generate'), [loadRuntimeRouteOptions]);
    const loadTtsRuntimeRouteOptions = useCallback(() => loadRuntimeRouteOptions('audio.synthesize'), [loadRuntimeRouteOptions]);
    const loadSttRuntimeRouteOptions = useCallback(() => loadRuntimeRouteOptions('audio.transcribe'), [loadRuntimeRouteOptions]);
    const loadImageRuntimeRouteOptions = useCallback(() => loadRuntimeRouteOptions('image.generate'), [loadRuntimeRouteOptions]);
    const loadVideoRuntimeRouteOptions = useCallback(() => loadRuntimeRouteOptions('video.generate'), [loadRuntimeRouteOptions]);
    const loadAllRuntimeRouteOptions = useCallback(async () => {
        // Sequential loading: each call triggers a state update + re-render.
        // Running them in parallel (Promise.all) causes 5 gRPC responses to land
        // in the same frame, flooding the main thread with state updates and
        // re-renders — this was the root cause of the app-wide UI stalls.
        const chat = await loadChatRuntimeRouteOptions();
        const image = await loadImageRuntimeRouteOptions();
        const video = await loadVideoRuntimeRouteOptions();
        const tts = await loadTtsRuntimeRouteOptions();
        const stt = await loadSttRuntimeRouteOptions();
        return { chat, image, video, tts, stt };
    }, [
        loadChatRuntimeRouteOptions,
        loadImageRuntimeRouteOptions,
        loadVideoRuntimeRouteOptions,
        loadTtsRuntimeRouteOptions,
        loadSttRuntimeRouteOptions,
    ]);
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
        void refreshRouteSnapshot();
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
                    const loadedSnapshot = await loadAllRuntimeRouteOptions();
                    loaded = (loadedSnapshot.chat
                        || loadedSnapshot.image
                        || loadedSnapshot.video
                        || loadedSnapshot.tts
                        || loadedSnapshot.stt
                        || null);
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
    }, [loadAllRuntimeRouteOptions]);
    useEffect(() => {
        const connectorCount = Math.max(chatRouteOptions?.connectors.length || 0, imageRouteOptions?.connectors.length || 0, videoRouteOptions?.connectors.length || 0, ttsRouteOptions?.connectors.length || 0, sttRouteOptions?.connectors.length || 0);
        const pollIntervalMs = connectorCount > 0 ? 30000 : 60000;
        const timer = setInterval(() => {
            void loadAllRuntimeRouteOptions();
        }, pollIntervalMs);
        return () => {
            clearInterval(timer);
        };
    }, [
        chatRouteOptions?.connectors.length,
        imageRouteOptions?.connectors.length,
        videoRouteOptions?.connectors.length,
        ttsRouteOptions?.connectors.length,
        sttRouteOptions?.connectors.length,
        loadAllRuntimeRouteOptions,
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
        loadAllRuntimeRouteOptions,
        refreshRouteSnapshot,
        handleHealthCheck,
        handleRouteSourceChange,
        handleRouteConnectorChange,
        handleRouteModelChange,
        clearRouteBinding,
    };
}
