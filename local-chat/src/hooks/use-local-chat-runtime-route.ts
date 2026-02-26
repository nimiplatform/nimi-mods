import { useCallback, useEffect, useState } from 'react';
import {
  type RuntimeRouteBinding,
  type RuntimeRouteOptionsSnapshot,
  type RuntimeRouteSource,
} from '@nimiplatform/sdk/mod/runtime-route';
import {
  loadLocalChatRouteOverride,
  persistLocalChatRouteOverride,
} from '../services/route/route-override-store.js';
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

  const refreshRouteSnapshot = useCallback(async () => {
    await resolveRouteSnapshot({
      aiClient: input.aiClient,
      routeOverride,
      setRouteSnapshot,
      setStatusBanner: input.setStatusBanner,
    });
  }, [input.aiClient, input.setStatusBanner, routeOverride]);

  const loadChatRuntimeRouteOptions = useCallback(async () => {
    await loadRouteOptions({
      hookClient: input.hookClient,
      setChatRouteOptions,
    });
  }, [input.hookClient]);

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
    void refreshRouteSnapshot();
  }, [refreshRouteSnapshot]);

  useEffect(() => {
    void loadChatRuntimeRouteOptions();
  }, [loadChatRuntimeRouteOptions]);

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
