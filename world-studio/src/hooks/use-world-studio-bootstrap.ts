import { useCallback, useEffect } from 'react';
import type { createHookClient } from '@nimiplatform/mod-sdk/hook';
import {
  asRecord } from '@nimiplatform/mod-sdk/utils';
import { parseRuntimeRouteOptions, type RuntimeRouteBinding, type RuntimeRouteOptionsSnapshot } from '@nimiplatform/mod-sdk/runtime-route';
import { WORLD_STUDIO_DATA_API_RUNTIME_ROUTE_OPTIONS, WORLD_STUDIO_MOD_ID } from '../contracts.js';
import { getMyWorldAccess, resolveWorldLanding } from '../data.js';
import {
  deriveLandingFromAccess,
  normalizeLandingTarget,
} from '../services/snapshot-normalize.js';
import { emitWorldStudioLog } from '../logging.js';
import type { LandingState } from '../ui/types.js';

type UseWorldStudioBootstrapInput = {
  bootstrapReady: boolean;
  flowId: string;
  hookClient: ReturnType<typeof createHookClient>;
  runtimeDefaultRouteBinding: RuntimeRouteBinding | null;
  setRouteOptions: (value: RuntimeRouteOptionsSnapshot | null) => void;
  setLanding: (value: LandingState) => void;
  setLandingLoading: (value: boolean) => void;
  setError: (value: string | null) => void;
};

export function useWorldStudioBootstrap(input: UseWorldStudioBootstrapInput) {
  const loadRuntimeRouteOptions = useCallback(async () => {
    try {
      const payload = await input.hookClient.data.query({
        capability: WORLD_STUDIO_DATA_API_RUNTIME_ROUTE_OPTIONS,
        query: {
          capability: 'chat',
          modId: WORLD_STUDIO_MOD_ID,
        },
      });
      input.setRouteOptions(parseRuntimeRouteOptions(payload, { includeResolvedDefault: true }));
    } catch {
      input.setRouteOptions(null);
    }
  }, [input.hookClient.data, input.setRouteOptions]);

  const resolveRuntimeDefaultRouteBinding = useCallback(async () => {
    if (input.runtimeDefaultRouteBinding) {
      return input.runtimeDefaultRouteBinding;
    }
    try {
      const payload = await input.hookClient.data.query({
        capability: WORLD_STUDIO_DATA_API_RUNTIME_ROUTE_OPTIONS,
        query: {
          capability: 'chat',
          modId: WORLD_STUDIO_MOD_ID,
        },
      });
      const parsed = parseRuntimeRouteOptions(payload, { includeResolvedDefault: true });
      if (parsed) {
        input.setRouteOptions(parsed);
        return parsed.resolvedDefault || parsed.selected;
      }
    } catch {
      // no-op
    }
    return null;
  }, [input.hookClient.data, input.runtimeDefaultRouteBinding, input.setRouteOptions]);

  const loadLanding = useCallback(async () => {
    input.setLandingLoading(true);
    input.setError(null);
    try {
      const payload = asRecord(await resolveWorldLanding(input.hookClient));
      const target = normalizeLandingTarget(payload.target);
      const worldId = String(payload.worldId || '').trim() || null;
      const reason = String(payload.reason || '').trim() || null;

      if (target === 'NO_ACCESS' && !reason) {
        const accessPayload = asRecord(await getMyWorldAccess(input.hookClient));
        input.setLanding(deriveLandingFromAccess(accessPayload));
      } else {
        input.setLanding({ target, worldId, reason });
      }

      emitWorldStudioLog({
        level: 'info',
        message: 'world:landing-resolve:done',
        flowId: input.flowId,
        source: 'WorldStudioPage.loadLanding',
        details: { target, worldId },
      });
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : String(loadError);
      input.setError(message);
      try {
        const accessPayload = asRecord(await getMyWorldAccess(input.hookClient));
        input.setLanding(deriveLandingFromAccess(accessPayload));
      } catch {
        input.setLanding({
          target: 'NO_ACCESS',
          worldId: null,
          reason: 'LANDING_QUERY_FAILED',
        });
      }
      emitWorldStudioLog({
        level: 'warn',
        message: 'world:landing-resolve:failed',
        flowId: input.flowId,
        source: 'WorldStudioPage.loadLanding',
        details: { error: message },
      });
    } finally {
      input.setLandingLoading(false);
    }
  }, [input.flowId, input.hookClient, input.setError, input.setLanding, input.setLandingLoading]);

  useEffect(() => {
    if (!input.bootstrapReady) return;
    void loadRuntimeRouteOptions();
  }, [input.bootstrapReady, loadRuntimeRouteOptions]);

  useEffect(() => {
    if (!input.bootstrapReady) return;
    void loadLanding();
  }, [input.bootstrapReady, loadLanding]);

  return {
    loadLanding,
    loadRuntimeRouteOptions,
    resolveRuntimeDefaultRouteBinding,
  };
}
