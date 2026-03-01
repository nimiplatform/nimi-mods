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

export function useLocalChatRuntimeRoute(input: UseLocalChatRuntimeRouteInput) {
  const [healthStatus, setHealthStatus] = useState<HealthStatus>('idle');
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [routeSnapshot, setRouteSnapshot] = useState<ChatRouteSnapshot | null>(null);
  const [chatRouteOptions, setChatRouteOptions] = useState<RuntimeRouteOptionsSnapshot | null>(null);
  const [routeOverride, setRouteOverride] = useState<RuntimeRouteBinding | null>(() => loadLocalChatRouteOverride());
  const routeOptionsLoadInFlightRef = useRef<Promise<RuntimeRouteOptionsSnapshot | null> | null>(null);

  const setChatRouteOptionsSafely = useCallback((next: RuntimeRouteOptionsSnapshot | null) => {
    setChatRouteOptions((previous) => {
      if (!next) {
        return previous;
      }
      if (next.connectors.length === 0 && (previous?.connectors.length || 0) > 0) {
        return previous;
      }
      return next;
    });
  }, []);

  const refreshRouteSnapshot = useCallback(async () => {
    await resolveRouteSnapshot({
      aiClient: input.aiClient,
      routeOverride,
      setRouteSnapshot,
      setStatusBanner: input.setStatusBanner,
    });
  }, [input.aiClient, input.setStatusBanner, routeOverride]);

  const loadChatRuntimeRouteOptions = useCallback(async () => {
    const inFlight = routeOptionsLoadInFlightRef.current;
    if (inFlight) {
      emitLocalChatLog({
        level: 'debug',
        message: 'action:local-chat:route-options:load:reuse-inflight',
        source: 'useLocalChatRuntimeRoute',
      });
      return inFlight;
    }
    const task = (async () => {
      emitLocalChatLog({
        level: 'debug',
        message: 'action:local-chat:route-options:load:start',
        source: 'useLocalChatRuntimeRoute',
      });
      const loaded = await loadRouteOptions({
        hookClient: input.hookClient,
        setChatRouteOptions: setChatRouteOptionsSafely,
      });
      emitLocalChatLog({
        level: 'debug',
        message: 'action:local-chat:route-options:load:done',
        source: 'useLocalChatRuntimeRoute',
        details: {
          loaded: Boolean(loaded),
          connectorsCount: loaded?.connectors.length ?? 0,
          selectedSource: loaded?.selected.source ?? null,
          selectedConnectorId: loaded?.selected.connectorId || null,
        },
      });
      return loaded;
    })();
    routeOptionsLoadInFlightRef.current = task;
    void task.finally(() => {
      if (routeOptionsLoadInFlightRef.current === task) {
        routeOptionsLoadInFlightRef.current = null;
      }
    });
    return task;
  }, [input.hookClient, setChatRouteOptionsSafely]);

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
          loaded = await loadChatRuntimeRouteOptions();
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
  }, [loadChatRuntimeRouteOptions]);

  useEffect(() => {
    const connectorCount = chatRouteOptions?.connectors.length || 0;
    const pollIntervalMs = connectorCount > 0 ? 10_000 : 30_000;
    const timer = setInterval(() => {
      void loadChatRuntimeRouteOptions();
    }, pollIntervalMs);
    return () => {
      clearInterval(timer);
    };
  }, [chatRouteOptions?.connectors.length, loadChatRuntimeRouteOptions]);

  return {
    healthStatus,
    checkingHealth,
    routeSnapshot,
    chatRouteOptions,
    routeOverride,
    loadChatRuntimeRouteOptions,
    refreshRouteSnapshot,
    handleHealthCheck,
    handleRouteSourceChange,
    handleRouteConnectorChange,
    handleRouteModelChange,
    clearRouteOverride,
  };
}
