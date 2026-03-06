import { useCallback, useEffect, useRef, useState } from 'react';
import type { RuntimeRouteBinding, RuntimeRouteSource } from '@nimiplatform/sdk/mod/runtime-route';
import type { RouteSourceDisplay } from '../types.js';
import { useKismetStore } from '../state/kismet-store.js';
import { getKismetRuntimeClient } from '../runtime-mod.js';
import { emitKismetLog } from '../logging.js';
import { ReasonCode } from '@nimiplatform/sdk/types';

const STORAGE_KEY = 'nimi.kismet.route-binding.v1';

function loadPersistedBinding(): RuntimeRouteBinding | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.source && parsed.model) {
      return parsed as RuntimeRouteBinding;
    }
  } catch { /* ignore */ }
  return null;
}

function persistBinding(binding: RuntimeRouteBinding | null) {
  if (binding) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(binding));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function useKismetRoute() {
  const {
    routeSource, setRouteSource,
    routeBinding, setRouteBinding,
    chatRouteOptions, setChatRouteOptions,
  } = useKismetStore();
  const [checking, setChecking] = useState(false);
  const mountedRef = useRef(false);

  // Load persisted override on mount
  useEffect(() => {
    const persisted = loadPersistedBinding();
    if (persisted) setRouteBinding(persisted);
    mountedRef.current = true;
  }, [setRouteBinding]);

  // Persist binding changes
  useEffect(() => {
    persistBinding(routeBinding);
  }, [routeBinding]);

  // Load route options (once on mount)
  useEffect(() => {
    (async () => {
      try {
        const runtimeClient = getKismetRuntimeClient();
        const snapshot = await runtimeClient.route.listOptions({
          capability: 'text.generate',
        });
        setChatRouteOptions(snapshot);
      } catch (err) {
        emitKismetLog({
          level: 'warn',
          message: 'action:route-options:failed',
          source: 'useKismetRoute',
          details: { error: err instanceof Error ? err.message : String(err) },
        });
        setChatRouteOptions(null);
      }
    })();
  }, [setChatRouteOptions]);

  // Health check — uses ref to read latest binding
  const routeBindingRef = useRef(routeBinding);
  routeBindingRef.current = routeBinding;

  const checkRouteHealth = useCallback(async (): Promise<RouteSourceDisplay> => {
    const currentBinding = routeBindingRef.current;
    setChecking(true);
    try {
      const runtimeClient = getKismetRuntimeClient();
      const health = await runtimeClient.route.checkHealth({
        capability: 'text.generate',
        binding: currentBinding || undefined,
      });
      if (health.reasonCode !== ReasonCode.RUNTIME_ROUTE_HEALTHY && health.reasonCode !== ReasonCode.RUNTIME_ROUTE_DEGRADED) {
        setRouteSource('unavailable');
        return 'unavailable';
      }
      const route = await runtimeClient.route.resolve({
        capability: 'text.generate',
        binding: currentBinding || undefined,
      });
      const source = (route.source === 'local-runtime' ? 'local-runtime' : 'token-api') as RouteSourceDisplay;
      setRouteSource(source);
      return source;
    } catch (err) {
      emitKismetLog({
        level: 'warn',
        message: 'action:route-health-check:failed',
        source: 'useKismetRoute',
        details: { error: err instanceof Error ? err.message : String(err) },
      });
      setRouteSource('unavailable');
      return 'unavailable';
    } finally {
      setChecking(false);
    }
  }, [setRouteSource]);

  // Re-check health when binding changes
  useEffect(() => {
    if (mountedRef.current) {
      checkRouteHealth();
    }
  }, [routeBinding, checkRouteHealth]);

  // Initial health check
  useEffect(() => {
    checkRouteHealth();
  }, [checkRouteHealth]);

  // Selection handlers
  const handleSourceChange = useCallback((source: RuntimeRouteSource) => {
    if (source === 'local-runtime') {
      const firstModel = chatRouteOptions?.localRuntime.models[0];
      setRouteBinding(firstModel ? {
        source: 'local-runtime',
        connectorId: '',
        model: firstModel.model,
        localModelId: firstModel.localModelId,
        engine: firstModel.engine,
      } : { source: 'local-runtime', connectorId: '', model: '' });
    } else {
      const firstConnector = chatRouteOptions?.connectors[0];
      setRouteBinding(firstConnector ? {
        source: 'token-api',
        connectorId: firstConnector.id,
        model: firstConnector.models[0] || '',
      } : { source: 'token-api', connectorId: '', model: '' });
    }
  }, [chatRouteOptions, setRouteBinding]);

  const handleConnectorChange = useCallback((connectorId: string) => {
    const connector = chatRouteOptions?.connectors.find((c) => c.id === connectorId);
    setRouteBinding({
      source: 'token-api',
      connectorId,
      model: connector?.models[0] || '',
    });
  }, [chatRouteOptions, setRouteBinding]);

  const handleModelChange = useCallback((model: string) => {
    const current = useKismetStore.getState().routeBinding;
    const source = current?.source || 'local-runtime';
    const localModel = source === 'local-runtime'
      ? chatRouteOptions?.localRuntime.models.find((m) => m.model === model)
      : undefined;
    setRouteBinding({
      source,
      connectorId: current?.connectorId || '',
      model,
      localModelId: localModel?.localModelId,
      engine: localModel?.engine,
    });
  }, [chatRouteOptions, setRouteBinding]);

  const clearBinding = useCallback(() => {
    setRouteBinding(null);
  }, [setRouteBinding]);

  return {
    routeSource,
    routeBinding,
    chatRouteOptions,
    checking,
    checkRouteHealth,
    handleSourceChange,
    handleConnectorChange,
    handleModelChange,
    clearBinding,
  };
}
