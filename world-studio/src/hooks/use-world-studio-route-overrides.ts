import type { RuntimeRouteBinding, RuntimeRouteOptionsSnapshot } from '@nimiplatform/sdk/mod/runtime-route';
import type { WorldStudioWorkspaceSnapshot } from '../contracts.js';
import { useWorldStudioRouteBindingActions } from './route-overrides/actions.js';
import { useWorldStudioRouteBindingDerived } from './route-overrides/derived.js';
import { useWorldStudioRouteBindingStore } from './route-overrides/store.js';

type UseWorldStudioRouteBindingsInput = {
  userId: string;
  routeOptions: RuntimeRouteOptionsSnapshot | null;
  runtimeDefaultRouteBinding: RuntimeRouteBinding | null;
  snapshot: WorldStudioWorkspaceSnapshot;
};

export function useWorldStudioRouteBindings(input: UseWorldStudioRouteBindingsInput) {
  const store = useWorldStudioRouteBindingStore(input.userId);
  const derived = useWorldStudioRouteBindingDerived({
    bindingMap: store.bindingMap,
    routeOptions: input.routeOptions,
    runtimeDefaultRouteBinding: input.runtimeDefaultRouteBinding,
    snapshot: input.snapshot,
  });
  const actions = useWorldStudioRouteBindingActions({
    bindingMap: store.bindingMap,
    setRouteBindingMap: store.setRouteBindingMap,
    routeOptions: input.routeOptions,
    runtimeDefaultRouteBinding: input.runtimeDefaultRouteBinding,
  });

  return {
    bindingMap: store.bindingMap,
    ...derived,
    ...actions,
  };
}

export type { RouteStage } from './route-overrides/actions.js';
export type { RuntimeRouteSource } from './route-overrides/actions.js';
