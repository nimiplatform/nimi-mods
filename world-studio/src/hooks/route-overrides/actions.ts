import { useCallback, type Dispatch, type SetStateAction } from 'react';
import {
  normalizeRuntimeRouteSource,
} from '@nimiplatform/mod-sdk/runtime-route';
import { type RuntimeRouteBinding, type RuntimeRouteOptionsSnapshot, type RuntimeRouteSource } from '@nimiplatform/mod-sdk/runtime-route';
import type { DistillRouteOverrideMap } from '../../generation/pipeline.js';

export type RouteStage = 'coarse' | 'fine';

type ResolveRouteOverridesInput = {
  mode: 'all' | 'failed';
  retryWithFineRoute: boolean;
  runtimeDefaultBinding?: RuntimeRouteBinding | null;
};

export function useWorldStudioRouteOverrideActions(input: {
  routeOverrideMap: DistillRouteOverrideMap;
  setRouteOverrideMap: Dispatch<SetStateAction<DistillRouteOverrideMap>>;
  routeOptions: RuntimeRouteOptionsSnapshot | null;
  runtimeDefaultRouteBinding: RuntimeRouteBinding | null;
}) {
  const onRouteSourceChange = useCallback((profile: RouteStage, sourceInput: string) => {
    const source = normalizeRuntimeRouteSource(sourceInput);
    input.setRouteOverrideMap((previous) => {
      const current = previous[profile];
      const firstLocalModel = input.routeOptions?.localRuntime.models[0] || null;
      const base = current || input.routeOptions?.selected || {
        source: 'local-runtime' as const,
        connectorId: '',
        model: '',
      };
      if (source === 'local-runtime') {
        return {
          ...previous,
          [profile]: {
            source: 'local-runtime',
            connectorId: '',
            model: firstLocalModel?.model || base.model || '',
            localModelId: firstLocalModel?.localModelId || base.localModelId,
            engine: firstLocalModel?.engine || base.engine,
          },
        };
      }
      const firstConnector = input.routeOptions?.connectors[0];
      return {
        ...previous,
        [profile]: {
          source: 'token-api',
          connectorId: firstConnector?.id || base.connectorId || '',
          model: firstConnector?.models[0] || base.model || '',
          localModelId: undefined,
          engine: undefined,
        },
      };
    });
  }, [input.routeOptions, input.setRouteOverrideMap]);

  const onRouteConnectorChange = useCallback((profile: RouteStage, connectorId: string) => {
    input.setRouteOverrideMap((previous) => {
      const connector = input.routeOptions?.connectors.find((item) => item.id === connectorId) || null;
      const base = previous[profile] || input.routeOptions?.selected || {
        source: 'token-api' as const,
        connectorId: '',
        model: '',
      };
      return {
        ...previous,
        [profile]: {
          source: 'token-api',
          connectorId,
          model: connector?.models[0] || base.model || '',
        },
      };
    });
  }, [input.routeOptions, input.setRouteOverrideMap]);

  const onRouteModelChange = useCallback((profile: RouteStage, model: string) => {
    input.setRouteOverrideMap((previous) => {
      const base = previous[profile] || input.routeOptions?.selected || {
        source: 'local-runtime' as const,
        connectorId: '',
        model: '',
      };
      return {
        ...previous,
        [profile]: {
          ...base,
          model,
        },
      };
    });
  }, [input.routeOptions, input.setRouteOverrideMap]);

  const onClearRouteOverride = useCallback((profile: RouteStage | 'all') => {
    input.setRouteOverrideMap((previous) => {
      if (profile === 'all') {
        return {
          coarse: null,
          fine: null,
        };
      }
      return {
        ...previous,
        [profile]: null,
      };
    });
  }, [input.setRouteOverrideMap]);

  const resolveEffectiveRouteOverrides = useCallback((options: ResolveRouteOverridesInput) => {
    const defaultBinding = options.runtimeDefaultBinding ?? input.runtimeDefaultRouteBinding;
    const normalized = {
      coarse: input.routeOverrideMap.coarse || defaultBinding || null,
      fine: input.routeOverrideMap.fine || defaultBinding || null,
    } as DistillRouteOverrideMap;
    if (options.mode !== 'failed' || !options.retryWithFineRoute) return normalized;
    const preferred = input.routeOverrideMap.fine || input.routeOverrideMap.coarse || null;
    if (!preferred) return normalized;
    return {
      coarse: preferred,
      fine: preferred,
    } as DistillRouteOverrideMap;
  }, [input.routeOverrideMap, input.runtimeDefaultRouteBinding]);

  return {
    onRouteSourceChange,
    onRouteConnectorChange,
    onRouteModelChange,
    onClearRouteOverride,
    resolveEffectiveRouteOverrides,
  };
}

export type { RuntimeRouteSource };
