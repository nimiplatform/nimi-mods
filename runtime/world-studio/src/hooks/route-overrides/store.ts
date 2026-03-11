import { useEffect, useState } from 'react';
import type { DistillRouteBindingMap } from '../../generation/pipeline.js';
import {
  loadWorldStudioRouteBindingMap,
  persistWorldStudioRouteBindingMap,
} from '../../services/mutation-payload.js';

export function useWorldStudioRouteBindingStore(userId: string) {
  const [bindingMap, setRouteBindingMap] = useState<DistillRouteBindingMap>({
    coarse: null,
    fine: null,
  });

  useEffect(() => {
    setRouteBindingMap(loadWorldStudioRouteBindingMap(userId));
  }, [userId]);

  useEffect(() => {
    persistWorldStudioRouteBindingMap(userId, bindingMap);
  }, [bindingMap, userId]);

  return {
    bindingMap,
    setRouteBindingMap,
  };
}
