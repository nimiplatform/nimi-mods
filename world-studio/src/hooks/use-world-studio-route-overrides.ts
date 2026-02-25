import type { RuntimeRouteBinding, RuntimeRouteOptionsSnapshot } from '@nimiplatform/mod-sdk/runtime-route';
import type { WorldStudioWorkspaceSnapshot } from '../contracts.js';
import { useWorldStudioRouteOverrideActions } from './route-overrides/actions.js';
import { useWorldStudioRouteOverrideDerived } from './route-overrides/derived.js';
import { useWorldStudioRouteOverrideStore } from './route-overrides/store.js';

type UseWorldStudioRouteOverridesInput = {
  userId: string;
  routeOptions: RuntimeRouteOptionsSnapshot | null;
  runtimeDefaultRouteBinding: RuntimeRouteBinding | null;
  snapshot: WorldStudioWorkspaceSnapshot;
};

export function useWorldStudioRouteOverrides(input: UseWorldStudioRouteOverridesInput) {
  const store = useWorldStudioRouteOverrideStore(input.userId);
  const derived = useWorldStudioRouteOverrideDerived({
    routeOverrideMap: store.routeOverrideMap,
    routeOptions: input.routeOptions,
    runtimeDefaultRouteBinding: input.runtimeDefaultRouteBinding,
    snapshot: input.snapshot,
  });
  const actions = useWorldStudioRouteOverrideActions({
    routeOverrideMap: store.routeOverrideMap,
    setRouteOverrideMap: store.setRouteOverrideMap,
    routeOptions: input.routeOptions,
    runtimeDefaultRouteBinding: input.runtimeDefaultRouteBinding,
  });

  return {
    routeOverrideMap: store.routeOverrideMap,
    ...derived,
    ...actions,
  };
}

export type { RouteStage } from './route-overrides/actions.js';
export type { RuntimeRouteSource } from './route-overrides/actions.js';
