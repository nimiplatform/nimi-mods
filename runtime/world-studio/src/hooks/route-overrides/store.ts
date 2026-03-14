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
  const [bindingMapHydrated, setBindingMapHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setBindingMapHydrated(false);
    void loadWorldStudioRouteBindingMap(userId).then((value) => {
      if (cancelled) {
        return;
      }
      setRouteBindingMap(value);
      setBindingMapHydrated(true);
    }).catch(() => {
      if (!cancelled) {
        setBindingMapHydrated(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!bindingMapHydrated) {
      return;
    }
    void persistWorldStudioRouteBindingMap(userId, bindingMap);
  }, [bindingMap, bindingMapHydrated, userId]);

  return {
    bindingMap,
    setRouteBindingMap,
  };
}
