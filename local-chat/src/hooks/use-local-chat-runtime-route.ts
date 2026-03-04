import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type RuntimeRouteBinding,
  type RuntimeRouteOptionsSnapshot,
  type RuntimeRouteSource,
} from '@nimiplatform/sdk/mod/runtime-route';
import {
  loadLocalChatRouteOverride,
  persistLocalChatRouteOverride,
} from '../services/route/route-override-store.js';
import { emitLocalChatLog } from '../logging.js';
import type { HealthStatus } from '../types.js';
import { buildRouteOverrideForConnector, buildRouteOverrideForModel, buildRouteOverrideForSource } from './runtime-route/override-actions.js';
import { loadRouteOptions, resolveRouteSnapshot, runRouteHealthCheck } from './runtime-route/queries.js';
import type { ChatRouteSnapshot, UseLocalChatRuntimeRouteInput } from './runtime-route/types.js';

type RouteCapability = 'chat' | 'tts' | 'stt';

export function useLocalChatRuntimeRoute(input: UseLocalChatRuntimeRouteInput) {
  const [healthStatus, setHealthStatus] = useState<HealthStatus>('idle');
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [routeSnapshot, setRouteSnapshot] = useState<ChatRouteSnapshot | null>(null);
  const [chatRouteOptions, setChatRouteOptions] = useState<RuntimeRouteOptionsSnapshot | null>(null);
  const [ttsRouteOptions, setTtsRouteOptions] = useState<RuntimeRouteOptionsSnapshot | null>(null);
  const [sttRouteOptions, setSttRouteOptions] = useState<RuntimeRouteOptionsSnapshot | null>(null);
  const [routeOverride, setRouteOverride] = useState<RuntimeRouteBinding | null>(() => loadLocalChatRouteOverride());
  const routeOptionsLoadInFlightRef = useRef<Partial<Record<RouteCapability, Promise<RuntimeRouteOptionsSnapshot | null>>>>({});

  const setRouteOptionsSafely = useCallback((capability: RouteCapability, next: RuntimeRouteOptionsSnapshot | null) => {
    if (capability === 'chat') {
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
    if (capability === 'tts') {
      setTtsRouteOptions(next);
      return;
    }
    setSttRouteOptions(next);
  }, []);

  const refreshRouteSnapshot = useCallback(async () => {
    await resolveRouteSnapshot({
      aiClient: input.aiClient,
      routeOverride,
      setRouteSnapshot,
      setStatusBanner: input.setStatusBanner,
    });
  }, [input.aiClient, input.setStatusBanner, routeOverride]);

  const loadRuntimeRouteOptions = useCallback(async (capability: RouteCapability) => {
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
        hookClient: input.hookClient,
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
  }, [input.hookClient, setRouteOptionsSafely]);

  const loadChatRuntimeRouteOptions = useCallback(
    () => loadRuntimeRouteOptions('chat'),
    [loadRuntimeRouteOptions],
  );
  const loadTtsRuntimeRouteOptions = useCallback(
    () => loadRuntimeRouteOptions('tts'),
    [loadRuntimeRouteOptions],
  );
  const loadSttRuntimeRouteOptions = useCallback(
    () => loadRuntimeRouteOptions('stt'),
    [loadRuntimeRouteOptions],
  );

  const loadAllRuntimeRouteOptions = useCallback(async () => {
    const [chat, tts, stt] = await Promise.all([
      loadChatRuntimeRouteOptions(),
      loadTtsRuntimeRouteOptions(),
      loadSttRuntimeRouteOptions(),
    ]);
    return { chat, tts, stt };
  }, [loadChatRuntimeRouteOptions, loadTtsRuntimeRouteOptions, loadSttRuntimeRouteOptions]);

  const handleHealthCheck = useCallback(async () => {
    await runRouteHealthCheck({
      aiClient: input.aiClient,
      routeOverride,
      setCheckingHealth,
      setHealthStatus,
      setStatusBanner: input.setStatusBanner,
    });
  }, [input.aiClient, input.setStatusBanner, routeOverride]);

  const handleRouteSourceChange = useCallback((source: RuntimeRouteSource) => {
    setRouteOverride((previous) => buildRouteOverrideForSource({
      source,
      previous,
      options: chatRouteOptions,
    }));
  }, [chatRouteOptions]);

  const handleRouteConnectorChange = useCallback((connectorId: string) => {
    setRouteOverride((previous) => buildRouteOverrideForConnector({
      connectorId,
      previous,
      options: chatRouteOptions,
    }));
  }, [chatRouteOptions]);

  const handleRouteModelChange = useCallback((model: string) => {
    setRouteOverride((previous) => buildRouteOverrideForModel({
      model,
      previous,
      options: chatRouteOptions,
    }));
  }, [chatRouteOptions]);

  const clearRouteOverride = useCallback(() => {
    setRouteOverride(null);
  }, []);

  useEffect(() => {
    persistLocalChatRouteOverride(routeOverride);
  }, [routeOverride]);

  useEffect(() => {
    if (!routeOverride || routeOverride.source !== 'token-api') {
      return;
    }
    const connectors = chatRouteOptions?.connectors || [];
    if (connectors.length === 0) {
      return;
    }
    const matched = connectors.find((item) => item.id === routeOverride.connectorId) || null;
    if (matched) {
      if (matched.models.length === 0) {
        return;
      }
      if (routeOverride.model && matched.models.includes(routeOverride.model)) {
        return;
      }
      const fallbackModel = matched.models[0] || '';
      if (!fallbackModel || fallbackModel === routeOverride.model) {
        return;
      }
      setRouteOverride((previous) => {
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
    setRouteOverride((previous) => {
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
  }, [chatRouteOptions, routeOverride]);

  useEffect(() => {
    if (routeSnapshot?.source !== 'token-api') {
      return;
    }
    const snapshotConnectorId = String(routeSnapshot.connectorId || '').trim();
    const snapshotModel = String(routeSnapshot.model || '').trim();
    if (!snapshotConnectorId && !snapshotModel) {
      return;
    }
    setRouteOverride((previous) => {
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
          loaded = loadedSnapshot.chat || loadedSnapshot.tts || loadedSnapshot.stt || null;
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
    ttsRouteOptions?.connectors.length,
    sttRouteOptions?.connectors.length,
    loadAllRuntimeRouteOptions,
  ]);

  return {
    healthStatus,
    checkingHealth,
    routeSnapshot,
    chatRouteOptions,
    ttsRouteOptions,
    sttRouteOptions,
    routeOptionsByCapability: {
      chat: chatRouteOptions,
      tts: ttsRouteOptions,
      stt: sttRouteOptions,
    },
    routeOverride,
    loadChatRuntimeRouteOptions,
    loadTtsRuntimeRouteOptions,
    loadSttRuntimeRouteOptions,
    loadAllRuntimeRouteOptions,
    refreshRouteSnapshot,
    handleHealthCheck,
    handleRouteSourceChange,
    handleRouteConnectorChange,
    handleRouteModelChange,
    clearRouteOverride,
  };
}
