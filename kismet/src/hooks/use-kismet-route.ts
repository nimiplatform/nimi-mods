import { useCallback, useEffect, useRef, useState } from 'react';
import { parseRuntimeRouteOptions, type RuntimeRouteBinding, type RuntimeRouteOptionsSnapshot, type RuntimeRouteSource } from '@nimiplatform/sdk/mod/runtime-route';
import type { RouteSourceDisplay } from '../types.js';
import { useKismetStore } from '../state/kismet-store.js';
import { getKismetAiClient, getKismetHookClient } from '../runtime-mod.js';
import { KISMET_DATA_API_RUNTIME_ROUTE_OPTIONS, KISMET_MOD_ID } from '../contracts.js';
import { emitKismetLog } from '../logging.js';
import { ReasonCode } from '@nimiplatform/sdk/types';

const STORAGE_KEY = 'nimi.kismet.route-override.v1';
const ROUTE_OPTIONS_QUERY_TIMEOUT_MS = 6000;
const POLL_INTERVAL_WITH_CONNECTORS_MS = 10_000;
const POLL_INTERVAL_NO_CONNECTORS_MS = 30_000;

function isUsableRouteBinding(
  binding: RuntimeRouteBinding | null | undefined,
  options: RuntimeRouteOptionsSnapshot | null,
): boolean {
  if (!binding) {
    return false;
  }
  const model = String(binding.model || '').trim();
  if (!model) {
    return false;
  }
  if (binding.source === 'local-runtime') {
    return true;
  }
  const connectorId = String(binding.connectorId || '').trim();
  if (!connectorId) {
    return false;
  }
  const connector = options?.connectors.find((item) => item.id === connectorId) || null;
  if (!connector) {
    return true;
  }
  return connector.models.length === 0 || connector.models.includes(model);
}

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

function normalizeTokenApiBinding(
  binding: RuntimeRouteBinding,
  connectors: RuntimeRouteOptionsSnapshot['connectors'],
): RuntimeRouteBinding {
  if (binding.source !== 'token-api' || connectors.length === 0) {
    return binding;
  }
  const matched = connectors.find((c) => c.id === binding.connectorId) || connectors[0];
  if (!matched) return binding;
  const connectorId = matched.id;
  const model = matched.models.includes(binding.model)
    ? binding.model
    : (matched.models[0] || binding.model || '');
  if (connectorId === binding.connectorId && model === binding.model) {
    return binding;
  }
  return { ...binding, connectorId, model };
}

async function loadRouteOptionsWithTimeout(hookClient: ReturnType<typeof getKismetHookClient>): Promise<RuntimeRouteOptionsSnapshot | null> {
  console.log('[KISMET:route] loadRouteOptions: start');
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const payload = await Promise.race<unknown>([
    hookClient.data.query({
      capability: KISMET_DATA_API_RUNTIME_ROUTE_OPTIONS,
      query: { capability: 'chat', modId: KISMET_MOD_ID },
    }),
    new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error(`kismet route options query timeout (${ROUTE_OPTIONS_QUERY_TIMEOUT_MS}ms)`));
      }, ROUTE_OPTIONS_QUERY_TIMEOUT_MS);
    }),
  ]).finally(() => {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  });
  console.log('[KISMET:route] loadRouteOptions: raw payload', JSON.stringify(payload, null, 2)?.slice(0, 2000));
  const parsed = parseRuntimeRouteOptions(payload, { includeResolvedDefault: true });
  console.log('[KISMET:route] loadRouteOptions: parsed', parsed ? {
    selectedSource: parsed.selected.source,
    selectedConnectorId: parsed.selected.connectorId,
    selectedModel: parsed.selected.model,
    connectorsCount: parsed.connectors.length,
    connectorIds: parsed.connectors.map((c) => c.id),
    connectorModels: parsed.connectors.map((c) => ({ id: c.id, models: c.models.slice(0, 5) })),
    localModelsCount: parsed.localRuntime.models.length,
  } : null);
  if (!parsed) return null;
  const selected = normalizeTokenApiBinding(parsed.selected, parsed.connectors);
  const resolvedDefault = parsed.resolvedDefault
    ? normalizeTokenApiBinding(parsed.resolvedDefault, parsed.connectors)
    : undefined;
  if (selected === parsed.selected && resolvedDefault === parsed.resolvedDefault) {
    return parsed;
  }
  return { ...parsed, selected, ...(resolvedDefault ? { resolvedDefault } : {}) };
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
    console.log('[KISMET:route] persisted override from localStorage', persisted);
    if (persisted) setRouteOverride(persisted);
    mountedRef.current = true;
  }, [setRouteOverride]);

  // Persist override changes
  useEffect(() => {
    persistOverride(routeOverride);
  }, [routeOverride]);

  // Load route options with retry and timeout
  const loadRouteOptions = useCallback(async (): Promise<RuntimeRouteOptionsSnapshot | null> => {
    try {
      const hookClient = getKismetHookClient();
      const result = await loadRouteOptionsWithTimeout(hookClient);
      if (result) {
        setChatRouteOptions((prev) => {
          if (!result) return prev;
          if (result.connectors.length === 0 && (prev?.connectors.length || 0) > 0) return prev;
          return result;
        });
      }
      return result;
    } catch (err) {
      emitKismetLog({
        level: 'warn',
        message: 'action:route-options:failed',
        source: 'useKismetRoute',
        details: { error: err instanceof Error ? err.message : String(err) },
      });
      return null;
    }
  }, [setChatRouteOptions]);

  // Initial load with retry
  useEffect(() => {
    let cancelled = false;
    const retryDelays = [0, 200, 500, 1000];
    (async () => {
      for (const delayMs of retryDelays) {
        if (cancelled) return;
        if (delayMs > 0) {
          await new Promise<void>((r) => setTimeout(r, delayMs));
          if (cancelled) return;
        }
        const loaded = await loadRouteOptions();
        if (loaded) return;
      }
    })();
    return () => { cancelled = true; };
  }, [loadRouteOptions]);

  // Poll route options periodically
  useEffect(() => {
    const hasConnectors = (chatRouteOptions?.connectors.length || 0) > 0;
    const intervalMs = hasConnectors ? POLL_INTERVAL_WITH_CONNECTORS_MS : POLL_INTERVAL_NO_CONNECTORS_MS;
    const timer = setInterval(() => { void loadRouteOptions(); }, intervalMs);
    return () => clearInterval(timer);
  }, [chatRouteOptions?.connectors.length, loadRouteOptions]);

  // Auto-correct stale token-api override when route options change
  useEffect(() => {
    if (!routeOverride || routeOverride.source !== 'token-api') return;
    const connectors = chatRouteOptions?.connectors || [];
    if (connectors.length === 0) return;
    const matched = connectors.find((c) => c.id === routeOverride.connectorId) || null;
    if (matched) {
      if (matched.models.length === 0) return;
      if (routeOverride.model && matched.models.includes(routeOverride.model)) return;
      const fallbackModel = matched.models[0] || '';
      if (!fallbackModel || fallbackModel === routeOverride.model) return;
      setRouteOverride({
        source: 'token-api',
        connectorId: matched.id,
        model: fallbackModel,
      });
      return;
    }
    const fallbackConnector = connectors[0] || null;
    if (!fallbackConnector) return;
    setRouteOverride({
      source: 'token-api',
      connectorId: fallbackConnector.id,
      model: fallbackConnector.models[0] || routeOverride.model || '',
    });
  }, [chatRouteOptions, routeOverride, setRouteOverride]);

  // Health check — uses ref to read latest routeOverride
  const routeOverrideRef = useRef(routeOverride);
  routeOverrideRef.current = routeOverride;

  const checkRouteHealth = useCallback(async (): Promise<RouteSourceDisplay> => {
    const currentOverride = routeOverrideRef.current;
    console.log('[KISMET:health] checkRouteHealth: start', { override: currentOverride });
    setChecking(true);
    try {
      if (currentOverride && !isUsableRouteBinding(currentOverride, chatRouteOptions)) {
        emitKismetLog({
          level: 'warn',
          message: 'action:route-health-check:invalid-override',
          source: 'useKismetRoute',
          details: {
            source: currentOverride.source,
            connectorId: currentOverride.connectorId || '',
            model: currentOverride.model || '',
          },
        });
        setRouteSource('unavailable');
        return 'unavailable';
      }
      const aiClient = getKismetAiClient();
      const routeInput = { routeHint: 'chat/default' as const, routeOverride: currentOverride || undefined };
      const health = await aiClient.checkRouteHealth(routeInput);
      console.log('[KISMET:health] checkRouteHealth: result', {
        status: (health as Record<string, unknown>).status,
        healthy: (health as Record<string, unknown>).healthy,
        reasonCode: health.reasonCode,
        actionHint: health.actionHint,
        provider: (health as Record<string, unknown>).provider,
        allKeys: Object.keys(health),
      });
      if (health.reasonCode !== ReasonCode.RUNTIME_ROUTE_HEALTHY && health.reasonCode !== ReasonCode.RUNTIME_ROUTE_DEGRADED) {
        console.log('[KISMET:health] route NOT healthy, expected', ReasonCode.RUNTIME_ROUTE_HEALTHY, 'or', ReasonCode.RUNTIME_ROUTE_DEGRADED, 'got', health.reasonCode);
        setRouteSource('unavailable');
        return 'unavailable';
      }
      const route = await aiClient.resolveRoute(routeInput);
      console.log('[KISMET:health] resolveRoute result', {
        source: route.source,
        model: route.model,
        provider: route.provider,
        connectorId: route.connectorId,
      });
      const source = (route.source === 'local-runtime' ? 'local-runtime' : 'token-api') as RouteSourceDisplay;
      setRouteSource(source);
      return source;
    } catch (err) {
      console.error('[KISMET:health] checkRouteHealth: EXCEPTION', err);
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
  }, [chatRouteOptions, setRouteSource]);

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
    isUsableRouteBinding: (binding: RuntimeRouteBinding | null | undefined) => isUsableRouteBinding(binding, chatRouteOptions),
    checkRouteHealth,
    handleSourceChange,
    handleConnectorChange,
    handleModelChange,
    clearOverride,
  };
}
