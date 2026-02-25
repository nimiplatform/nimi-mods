import { useEffect, useState } from 'react';
import type { DistillRouteOverrideMap } from '../../generation/pipeline.js';
import {
  loadWorldStudioRouteOverrideMap,
  persistWorldStudioRouteOverrideMap,
} from '../../services/mutation-payload.js';

export function useWorldStudioRouteOverrideStore(userId: string) {
  const [routeOverrideMap, setRouteOverrideMap] = useState<DistillRouteOverrideMap>({
    coarse: null,
    fine: null,
  });

  useEffect(() => {
    setRouteOverrideMap(loadWorldStudioRouteOverrideMap(userId));
  }, [userId]);

  useEffect(() => {
    persistWorldStudioRouteOverrideMap(userId, routeOverrideMap);
  }, [routeOverrideMap, userId]);

  return {
    routeOverrideMap,
    setRouteOverrideMap,
  };
}
