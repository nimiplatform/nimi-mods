import { useCallback, useEffect, useRef, useState } from 'react';
import { useUiExtensionContext } from '@nimiplatform/sdk/mod/ui';
import { parseRuntimeRouteOptions, type RuntimeRouteBinding, type RuntimeRouteOptionsSnapshot, type RuntimeRouteSource } from '@nimiplatform/sdk/mod/runtime-route';
import type { RouteSourceDisplay } from '../types.js';
import { useKismetStore } from '../state/kismet-store.js';
import { getKismetRouteClient } from '../runtime-mod.js';
import { KISMET_RUNTIME_TEXT_CAPABILITY } from '../contracts.js';
import { emitKismetLog } from '../logging.js';

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

function isConnectorNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return message.includes('AI_CONNECTOR_NOT_FOUND');
}

export function isKismetRouteHealthHealthy(
  health: { healthy?: boolean; status?: string; reasonCode?: string },
): boolean {
  const status = String(health.status || '').trim().toLowerCase();
  if (status === 'healthy' || status === 'degraded') {
    return true;
  }
  if (typeof health.healthy === 'boolean') {
    return health.healthy;
  }
  const reasonCode = String(health.reasonCode || '').trim();
  return reasonCode === 'RUNTIME_ROUTE_HEALTHY' || reasonCode === 'RUNTIME_ROUTE_DEGRADED';
}

async function loadRouteOptionsWithTimeout(routeClient: ReturnType<typeof getKismetRouteClient>): Promise<RuntimeRouteOptionsSnapshot | null> {
  console.log('[KISMET:route] loadRouteOptions: start');
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const payload = await Promise.race<unknown>([
    routeClient.listOptions({
      capability: KISMET_RUNTIME_TEXT_CAPABILITY,
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
    routeBinding, setRouteBinding,
    chatRouteOptions, setChatRouteOptions,
    routeOptionsLoading, setRouteOptionsLoading,
    routeOptionsError, setRouteOptionsError,
  } = useKismetStore();
  const { runtimeFields, setRuntimeFields } = useUiExtensionContext();
  const [checking, setChecking] = useState(false);
  const mountedRef = useRef(false);

  // Load persisted override on mount
  useEffect(() => {
    const persisted = loadPersistedOverride();
    console.log('[KISMET:route] persisted override from localStorage', persisted);
    if (persisted) setRouteBinding(persisted);
    mountedRef.current = true;
  }, [setRouteBinding]);

  // Persist override changes
  useEffect(() => {
    persistOverride(routeBinding);
  }, [routeBinding]);

  const recoverFromMissingConnector = useCallback((binding: RuntimeRouteBinding | null | undefined): boolean => {
    let recovered = false;
    if (binding?.source === 'token-api' && String(binding.connectorId || '').trim()) {
      setRouteBinding(null);
      recovered = true;
    }
    if (String(runtimeFields.connectorId || '').trim()) {
      setRuntimeFields({
        connectorId: '',
        localProviderModel: '',
      });
      recovered = true;
    }
    return recovered;
  }, [runtimeFields.connectorId, setRouteBinding, setRuntimeFields]);

  // Load route options with retry and timeout
  const loadRouteOptions = useCallback(async (): Promise<RuntimeRouteOptionsSnapshot | null> => {
    setRouteOptionsLoading(true);
    setRouteOptionsError(null);
    try {
      const routeClient = getKismetRouteClient();
      const result = await loadRouteOptionsWithTimeout(routeClient);
      if (!result) {
        setRouteOptionsError('KISMET_ROUTE_OPTIONS_INVALID');
        return null;
      }
      if (result) {
        setChatRouteOptions((prev) => {
          if (!result) return prev;
          if (result.connectors.length === 0 && (prev?.connectors.length || 0) > 0) return prev;
          return result;
        });
      }
      setRouteOptionsError(null);
      return result;
    } catch (err) {
      if (isConnectorNotFoundError(err) && recoverFromMissingConnector(routeBinding)) {
        setRouteOptionsError('AI_CONNECTOR_NOT_FOUND');
        return null;
      }
      const errorMessage = err instanceof Error ? err.message : String(err);
      emitKismetLog({
        level: 'warn',
        message: 'action:route-options:failed',
        source: 'useKismetRoute',
        details: { error: errorMessage },
      });
      setRouteOptionsError(errorMessage);
      return null;
    } finally {
      setRouteOptionsLoading(false);
    }
  }, [recoverFromMissingConnector, routeBinding, setChatRouteOptions, setRouteOptionsError, setRouteOptionsLoading]);

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

  useEffect(() => {
    if (!mountedRef.current) {
      return;
    }
    void loadRouteOptions();
  }, [loadRouteOptions, runtimeFields.connectorId]);

  // Poll route options periodically
  useEffect(() => {
    const hasConnectors = (chatRouteOptions?.connectors.length || 0) > 0;
    const intervalMs = hasConnectors ? POLL_INTERVAL_WITH_CONNECTORS_MS : POLL_INTERVAL_NO_CONNECTORS_MS;
    const timer = setInterval(() => { void loadRouteOptions(); }, intervalMs);
    return () => clearInterval(timer);
  }, [chatRouteOptions?.connectors.length, loadRouteOptions]);

  // Auto-correct stale token-api override when route options change
  useEffect(() => {
    if (!routeBinding || routeBinding.source !== 'token-api') return;
    const connectors = chatRouteOptions?.connectors || [];
    if (connectors.length === 0) return;
    const matched = connectors.find((c) => c.id === routeBinding.connectorId) || null;
    if (matched) {
      if (matched.models.length === 0) return;
      if (routeBinding.model && matched.models.includes(routeBinding.model)) return;
      const fallbackModel = matched.models[0] || '';
      if (!fallbackModel || fallbackModel === routeBinding.model) return;
      setRouteBinding({
        source: 'token-api',
        connectorId: matched.id,
        model: fallbackModel,
      });
      return;
    }
    const fallbackConnector = connectors[0] || null;
    if (!fallbackConnector) return;
    setRouteBinding({
      source: 'token-api',
      connectorId: fallbackConnector.id,
      model: fallbackConnector.models[0] || routeBinding.model || '',
    });
  }, [chatRouteOptions, routeBinding, setRouteBinding]);

  // Health check — uses ref to read latest routeBinding
  const routeBindingRef = useRef(routeBinding);
  routeBindingRef.current = routeBinding;

  const checkRouteHealth = useCallback(async (): Promise<RouteSourceDisplay> => {
    const currentOverride = routeBindingRef.current;
    console.log('[KISMET:health] checkRouteHealth: start', { override: currentOverride });
    if (!chatRouteOptions && !currentOverride) {
      setRouteSource('unavailable');
      return 'unavailable';
    }
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
      const routeClient = getKismetRouteClient();
      const routeInput = {
        capability: KISMET_RUNTIME_TEXT_CAPABILITY,
        binding: currentOverride || undefined,
      };
      const health = await routeClient.checkHealth(routeInput);
      console.log('[KISMET:health] checkRouteHealth: result', {
        status: (health as Record<string, unknown>).status,
        healthy: (health as Record<string, unknown>).healthy,
        reasonCode: health.reasonCode,
        actionHint: health.actionHint,
        provider: (health as Record<string, unknown>).provider,
        allKeys: Object.keys(health),
      });
      if (!isKismetRouteHealthHealthy(health)) {
        console.log('[KISMET:health] route NOT healthy, got', {
          status: (health as Record<string, unknown>).status,
          healthy: (health as Record<string, unknown>).healthy,
          reasonCode: health.reasonCode,
        });
        setRouteSource('unavailable');
        return 'unavailable';
      }
      const route = await routeClient.resolve(routeInput);
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
      if (isConnectorNotFoundError(err) && recoverFromMissingConnector(currentOverride)) {
        setRouteSource('unavailable');
        return 'unavailable';
      }
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
  }, [chatRouteOptions, recoverFromMissingConnector, setRouteSource]);

  // Re-check health when routeBinding changes
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

  const clearOverride = useCallback(() => {
    setRouteBinding(null);
  }, [setRouteBinding]);

  return {
    routeSource,
    routeBinding,
    chatRouteOptions,
    routeOptionsLoading,
    routeOptionsError,
    checking,
    isUsableRouteBinding: (binding: RuntimeRouteBinding | null | undefined) => isUsableRouteBinding(binding, chatRouteOptions),
    checkRouteHealth,
    reloadRouteOptions: loadRouteOptions,
    handleSourceChange,
    handleConnectorChange,
    handleModelChange,
    clearOverride,
  };
}
