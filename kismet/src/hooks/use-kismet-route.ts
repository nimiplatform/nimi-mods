import { useCallback, useEffect, useRef, useState } from 'react';
import { parseRuntimeRouteOptions, type RuntimeRouteBinding, type RuntimeRouteSource } from '@nimiplatform/mod-sdk/runtime-route';
import type { RouteSourceDisplay } from '../types.js';
import { useKismetStore } from '../state/kismet-store.js';
import { getKismetAiClient, getKismetHookClient } from '../runtime-mod.js';
import { KISMET_DATA_API_RUNTIME_ROUTE_OPTIONS, KISMET_MOD_ID } from '../contracts.js';
import { emitKismetLog } from '../logging.js';

const STORAGE_KEY = 'nimi.kismet.route-override.v1';

function loadPersistedOverride(): RuntimeRouteBinding | null {
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

function persistOverride(override: RuntimeRouteBinding | null) {
  if (override) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(override));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function useKismetRoute() {
  const {
    routeSource, setRouteSource,
    routeOverride, setRouteOverride,
    chatRouteOptions, setChatRouteOptions,
  } = useKismetStore();
  const [checking, setChecking] = useState(false);
  const mountedRef = useRef(false);

  // Load persisted override on mount
  useEffect(() => {
    const persisted = loadPersistedOverride();
    if (persisted) setRouteOverride(persisted);
    mountedRef.current = true;
  }, [setRouteOverride]);

  // Persist override changes
  useEffect(() => {
    persistOverride(routeOverride);
  }, [routeOverride]);

  // Load route options (once on mount)
  useEffect(() => {
    (async () => {
      try {
        const hookClient = getKismetHookClient();
        const payload = await hookClient.data.query({
          capability: KISMET_DATA_API_RUNTIME_ROUTE_OPTIONS,
          query: { capability: 'chat', modId: KISMET_MOD_ID },
        });
        setChatRouteOptions(parseRuntimeRouteOptions(payload, { includeResolvedDefault: true }));
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

  // Health check — uses ref to read latest routeOverride
  const routeOverrideRef = useRef(routeOverride);
  routeOverrideRef.current = routeOverride;

  const checkRouteHealth = useCallback(async (): Promise<RouteSourceDisplay> => {
    const currentOverride = routeOverrideRef.current;
    setChecking(true);
    try {
      const aiClient = getKismetAiClient();
      const routeInput = { routeHint: 'chat/default' as const, routeOverride: currentOverride || undefined };
      const health = await aiClient.checkRouteHealth(routeInput);
      if (health.reasonCode !== 'RUNTIME_ROUTE_HEALTHY' && health.reasonCode !== 'RUNTIME_ROUTE_DEGRADED') {
        setRouteSource('unavailable');
        return 'unavailable';
      }
      const route = await aiClient.resolveRoute(routeInput);
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

  // Re-check health when routeOverride changes
  useEffect(() => {
    if (mountedRef.current) {
      checkRouteHealth();
    }
  }, [routeOverride, checkRouteHealth]);

  // Initial health check
  useEffect(() => {
    checkRouteHealth();
  }, [checkRouteHealth]);

  // Selection handlers
  const handleSourceChange = useCallback((source: RuntimeRouteSource) => {
    if (source === 'local-runtime') {
      const firstModel = chatRouteOptions?.localRuntime.models[0];
      setRouteOverride(firstModel ? {
        source: 'local-runtime',
        connectorId: '',
        model: firstModel.model,
        localModelId: firstModel.localModelId,
        engine: firstModel.engine,
      } : { source: 'local-runtime', connectorId: '', model: '' });
    } else {
      const firstConnector = chatRouteOptions?.connectors[0];
      setRouteOverride(firstConnector ? {
        source: 'token-api',
        connectorId: firstConnector.id,
        model: firstConnector.models[0] || '',
      } : { source: 'token-api', connectorId: '', model: '' });
    }
  }, [chatRouteOptions, setRouteOverride]);

  const handleConnectorChange = useCallback((connectorId: string) => {
    const connector = chatRouteOptions?.connectors.find((c) => c.id === connectorId);
    setRouteOverride({
      source: 'token-api',
      connectorId,
      model: connector?.models[0] || '',
    });
  }, [chatRouteOptions, setRouteOverride]);

  const handleModelChange = useCallback((model: string) => {
    const current = useKismetStore.getState().routeOverride;
    const source = current?.source || 'local-runtime';
    const localModel = source === 'local-runtime'
      ? chatRouteOptions?.localRuntime.models.find((m) => m.model === model)
      : undefined;
    setRouteOverride({
      source,
      connectorId: current?.connectorId || '',
      model,
      localModelId: localModel?.localModelId,
      engine: localModel?.engine,
    });
  }, [chatRouteOptions, setRouteOverride]);

  const clearOverride = useCallback(() => {
    setRouteOverride(null);
  }, [setRouteOverride]);

  return {
    routeSource,
    routeOverride,
    chatRouteOptions,
    checking,
    checkRouteHealth,
    handleSourceChange,
    handleConnectorChange,
    handleModelChange,
    clearOverride,
  };
}
