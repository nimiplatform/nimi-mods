import { useCallback, type Dispatch, type SetStateAction } from 'react';
import {
  normalizeRuntimeRouteSource,
} from '@nimiplatform/sdk/mod/runtime-route';
import { type RuntimeRouteBinding, type RuntimeRouteOptionsSnapshot, type RuntimeRouteSource } from '@nimiplatform/sdk/mod/runtime-route';
import type { DistillRouteBindingMap } from '../../generation/pipeline.js';

export type RouteStage = 'coarse' | 'fine';

type ResolveRouteBindingsInput = {
  mode: 'all' | 'failed';
  retryWithFineRoute: boolean;
  runtimeDefaultBinding?: RuntimeRouteBinding | null;
};

export function useWorldStudioRouteBindingActions(input: {
  bindingMap: DistillRouteBindingMap;
  setRouteBindingMap: Dispatch<SetStateAction<DistillRouteBindingMap>>;
  routeOptions: RuntimeRouteOptionsSnapshot | null;
  runtimeDefaultRouteBinding: RuntimeRouteBinding | null;
}) {
  const onRouteSourceChange = useCallback((profile: RouteStage, sourceInput: string) => {
    const source = normalizeRuntimeRouteSource(sourceInput);
    input.setRouteBindingMap((previous) => {
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
  }, [input.routeOptions, input.setRouteBindingMap]);

  const onRouteConnectorChange = useCallback((profile: RouteStage, connectorId: string) => {
    input.setRouteBindingMap((previous) => {
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
  }, [input.routeOptions, input.setRouteBindingMap]);

  const onRouteModelChange = useCallback((profile: RouteStage, model: string) => {
    input.setRouteBindingMap((previous) => {
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
  }, [input.routeOptions, input.setRouteBindingMap]);

  const onClearRouteBinding = useCallback((profile: RouteStage | 'all') => {
    input.setRouteBindingMap((previous) => {
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
  }, [input.setRouteBindingMap]);

  const resolveEffectiveRouteBindings = useCallback((options: ResolveRouteBindingsInput) => {
    const defaultBinding = options.runtimeDefaultBinding ?? input.runtimeDefaultRouteBinding;
    const normalized = {
      coarse: input.bindingMap.coarse || defaultBinding || null,
      fine: input.bindingMap.fine || defaultBinding || null,
    } as DistillRouteBindingMap;
    if (options.mode !== 'failed' || !options.retryWithFineRoute) return normalized;
    const preferred = input.bindingMap.fine || input.bindingMap.coarse || null;
    if (!preferred) return normalized;
    return {
      coarse: preferred,
      fine: preferred,
    } as DistillRouteBindingMap;
  }, [input.bindingMap, input.runtimeDefaultRouteBinding]);

  return {
    onRouteSourceChange,
    onRouteConnectorChange,
    onRouteModelChange,
    onClearRouteBinding,
    resolveEffectiveRouteBindings,
  };
}

export type { RuntimeRouteSource };
