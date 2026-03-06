import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type RuntimeRouteBinding,
  type RuntimeCanonicalCapability,
  type RuntimeRouteOptionsSnapshot,
  type RuntimeRouteSource,
} from '@nimiplatform/sdk/mod/runtime-route';
import {
  loadLocalChatRouteBinding,
  persistLocalChatRouteBinding,
} from '../services/route/route-override-store.js';
import { emitLocalChatLog } from '../logging.js';
import type { HealthStatus } from '../types.js';
import { buildRouteBindingForConnector, buildRouteBindingForModel, buildRouteBindingForSource } from './runtime-route/override-actions.js';
import { loadRouteOptions, resolveRouteSnapshot, runRouteHealthCheck } from './runtime-route/queries.js';
import type { ChatRouteSnapshot, UseLocalChatRuntimeRouteInput } from './runtime-route/types.js';

type RouteCapability = RuntimeCanonicalCapability;
type RouteOptionsCapability =
  | 'text.generate'
  | 'image.generate'
  | 'video.generate'
  | 'audio.synthesize'
  | 'audio.transcribe';

export function useLocalChatRuntimeRoute(input: UseLocalChatRuntimeRouteInput) {
  const [healthStatus, setHealthStatus] = useState<HealthStatus>('idle');
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [routeSnapshot, setRouteSnapshot] = useState<ChatRouteSnapshot | null>(null);
  const [chatRouteOptions, setChatRouteOptions] = useState<RuntimeRouteOptionsSnapshot | null>(null);
  const [imageRouteOptions, setImageRouteOptions] = useState<RuntimeRouteOptionsSnapshot | null>(null);
  const [videoRouteOptions, setVideoRouteOptions] = useState<RuntimeRouteOptionsSnapshot | null>(null);
  const [ttsRouteOptions, setTtsRouteOptions] = useState<RuntimeRouteOptionsSnapshot | null>(null);
  const [sttRouteOptions, setSttRouteOptions] = useState<RuntimeRouteOptionsSnapshot | null>(null);
  const [routeBinding, setRouteBinding] = useState<RuntimeRouteBinding | null>(() => loadLocalChatRouteBinding());
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

  const loadChatRuntimeRouteOptions = useCallback(
    () => loadRuntimeRouteOptions('text.generate'),
    [loadRuntimeRouteOptions],
  );
  const loadTtsRuntimeRouteOptions = useCallback(
    () => loadRuntimeRouteOptions('audio.synthesize'),
    [loadRuntimeRouteOptions],
  );
  const loadSttRuntimeRouteOptions = useCallback(
    () => loadRuntimeRouteOptions('audio.transcribe'),
    [loadRuntimeRouteOptions],
  );
  const loadImageRuntimeRouteOptions = useCallback(
    () => loadRuntimeRouteOptions('image.generate'),
    [loadRuntimeRouteOptions],
  );
  const loadVideoRuntimeRouteOptions = useCallback(
    () => loadRuntimeRouteOptions('video.generate'),
    [loadRuntimeRouteOptions],
  );

  const loadAllRuntimeRouteOptions = useCallback(async () => {
    const [chat, image, video, tts, stt] = await Promise.all([
      loadChatRuntimeRouteOptions(),
      loadImageRuntimeRouteOptions(),
      loadVideoRuntimeRouteOptions(),
      loadTtsRuntimeRouteOptions(),
      loadSttRuntimeRouteOptions(),
    ]);
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
    persistLocalChatRouteBinding(routeBinding);
  }, [routeBinding]);

  useEffect(() => {
    if (!routeBinding || routeBinding.source !== 'token-api') {
      return;
    }
    const connectors = chatRouteOptions?.connectors || [];
    if (connectors.length === 0) {
      return;
    }
    const matched = connectors.find((item) => item.id === routeBinding.connectorId) || null;
    if (matched) {
      if (matched.models.length === 0) {
        return;
      }
      if (routeBinding.model && matched.models.includes(routeBinding.model)) {
        return;
      }
      const fallbackModel = matched.models[0] || '';
      if (!fallbackModel || fallbackModel === routeBinding.model) {
        return;
      }
      setRouteBinding((previous) => {
        if (!previous || previous.source !== 'token-api') {
          return previous;
        }
        if (previous.connectorId !== matched.id) {
          return previous;
        }
        if (previous.model === fallbackModel) {
          return previous;
        }
        return {
          source: 'token-api',
          connectorId: matched.id,
          model: fallbackModel,
        };
      });
      return;
    }
    const fallbackConnector = connectors[0] || null;
    if (!fallbackConnector) {
      return;
    }
    const fallbackModel = fallbackConnector.models[0] || '';
    setRouteBinding((previous) => {
      if (!previous || previous.source !== 'token-api') {
        return previous;
      }
      const nextConnectorId = fallbackConnector.id;
      const nextModel = fallbackModel || previous.model || '';
      if (previous.connectorId === nextConnectorId && previous.model === nextModel) {
        return previous;
      }
      return {
        source: 'token-api',
        connectorId: nextConnectorId,
        model: nextModel,
      };
    });
  }, [chatRouteOptions, routeBinding]);

  useEffect(() => {
    if (routeSnapshot?.source !== 'token-api') {
      return;
    }
    const snapshotConnectorId = String(routeSnapshot.connectorId || '').trim();
    const snapshotModel = String(routeSnapshot.model || '').trim();
    if (!snapshotConnectorId && !snapshotModel) {
      return;
    }
    setRouteBinding((previous) => {
      if (!previous || previous.source !== 'token-api') {
        return previous;
      }
      const nextConnectorId = String(previous.connectorId || '').trim() || snapshotConnectorId;
      const nextModel = String(previous.model || '').trim() || snapshotModel;
      if (!nextConnectorId && !nextModel) {
        return previous;
      }
      if (nextConnectorId === previous.connectorId && nextModel === previous.model) {
        return previous;
      }
      return {
        source: 'token-api',
        connectorId: nextConnectorId,
        model: nextModel,
      };
    });
  }, [routeSnapshot?.connectorId, routeSnapshot?.model, routeSnapshot?.source]);

  useEffect(() => {
    void refreshRouteSnapshot();
  }, [refreshRouteSnapshot]);

  useEffect(() => {
    let cancelled = false;
    const loadWithRetry = async () => {
      const retryDelayMs = [0, 200, 500, 1000];
      for (const delayMs of retryDelayMs) {
        if (cancelled) return;
        if (delayMs > 0) {
          await new Promise<void>((resolve) => {
            setTimeout(() => resolve(), delayMs);
          });
          if (cancelled) return;
        }
        let loaded: RuntimeRouteOptionsSnapshot | null = null;
        try {
          const loadedSnapshot = await loadAllRuntimeRouteOptions();
          loaded = (
            loadedSnapshot.chat
            || loadedSnapshot.image
            || loadedSnapshot.video
            || loadedSnapshot.tts
            || loadedSnapshot.stt
            || null
          );
        } catch {
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
    const connectorCount = Math.max(
      chatRouteOptions?.connectors.length || 0,
      imageRouteOptions?.connectors.length || 0,
      videoRouteOptions?.connectors.length || 0,
      ttsRouteOptions?.connectors.length || 0,
      sttRouteOptions?.connectors.length || 0,
    );
    const pollIntervalMs = connectorCount > 0 ? 10_000 : 30_000;
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
