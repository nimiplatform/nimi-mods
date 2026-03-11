import { useCallback, useEffect, useRef, useState } from 'react';
import { parseRuntimeRouteOptions, type RuntimeRouteOptionsSnapshot } from '@nimiplatform/sdk/mod/runtime-route';
import { emitMintYouLog } from '../logging.js';
import { ensureMintYouRouteOptionsSnapshotShape } from '../route-binding.js';
import { getMintYouRuntimeClient } from '../runtime-mod.js';

export function useMintYouRouteOptions() {
  const [routeOptions, setRouteOptions] = useState<RuntimeRouteOptionsSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef<Promise<RuntimeRouteOptionsSnapshot | null> | null>(null);

  const loadRouteOptions = useCallback(async (options?: { forceRefresh?: boolean }): Promise<RuntimeRouteOptionsSnapshot | null> => {
    const inFlight = inFlightRef.current;
    if (inFlight) {
      return inFlight;
    }
    const forceRefresh = options?.forceRefresh === true;

    const task = (async () => {
      setLoading(true);
      setError(null);

      try {
        const runtimeClient = getMintYouRuntimeClient();
        const snapshot = ensureMintYouRouteOptionsSnapshotShape(
          parseRuntimeRouteOptions(await runtimeClient.route.listOptions({
            capability: 'text.generate',
          }), {
            includeResolvedDefault: true,
          }),
        );
        if (!snapshot) {
          throw new Error('MINT_YOU_ROUTE_OPTIONS_INVALID');
        }
        setRouteOptions(snapshot);
        emitMintYouLog({
          level: 'debug',
          message: 'action:route-options:loaded',
          source: 'useMintYouRouteOptions',
          details: {
            forceRefresh,
            selectedSource: snapshot.selected.source,
            selectedConnectorId: snapshot.selected.connectorId,
            selectedModel: snapshot.selected.model,
            localModelCount: snapshot.local?.models.length || 0,
            connectorCount: snapshot.connectors.length,
          },
        });

        return snapshot;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err || '');
        setError(msg);
        emitMintYouLog({
          level: 'warn',
          message: 'action:route-options:failed',
          source: 'useMintYouRouteOptions',
          details: { error: msg },
        });
        return null;
      } finally {
        setLoading(false);
      }
    })();

    inFlightRef.current = task;
    void task.finally(() => {
      if (inFlightRef.current === task) {
        inFlightRef.current = null;
      }
    });

    return task;
  }, []);

  useEffect(() => {
    void loadRouteOptions();
  }, [loadRouteOptions]);

  return {
    routeOptions,
    loading,
    error,
    reloadRouteOptions: loadRouteOptions,
  };
}
