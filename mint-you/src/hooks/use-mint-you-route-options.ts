import { useCallback, useEffect, useRef, useState } from 'react';
import {
  parseRuntimeRouteOptions,
  type RuntimeRouteOptionsSnapshot,
} from '@nimiplatform/sdk/mod/runtime-route';
import {
  MINTYOU_DATA_API_RUNTIME_ROUTE_OPTIONS,
  MINTYOU_MOD_ID,
} from '../contracts.js';
import { emitMintYouLog } from '../logging.js';
import { getMintYouHookClient } from '../runtime-mod.js';

const ROUTE_OPTIONS_TIMEOUT_MS = 7000;

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
        const hookClient = getMintYouHookClient();
        let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
        const payload = await Promise.race<unknown>([
          hookClient.data.query({
            capability: MINTYOU_DATA_API_RUNTIME_ROUTE_OPTIONS,
            query: {
              capability: 'chat',
              modId: MINTYOU_MOD_ID,
              forceRefresh,
            },
          }),
          new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(() => {
              reject(new Error(`mint-you route options query timeout (${ROUTE_OPTIONS_TIMEOUT_MS}ms)`));
            }, ROUTE_OPTIONS_TIMEOUT_MS);
          }),
        ]).finally(() => {
          if (timeoutHandle) {
            clearTimeout(timeoutHandle);
          }
        });

        const parsed = parseRuntimeRouteOptions(payload, { includeResolvedDefault: true });
        if (!parsed) {
          throw new Error('MINTYOU_ROUTE_OPTIONS_PARSE_FAILED');
        }

        setRouteOptions(parsed);
        emitMintYouLog({
          level: 'debug',
          message: 'action:route-options:loaded',
          source: 'useMintYouRouteOptions',
          details: {
            forceRefresh,
            selectedSource: parsed.selected.source,
            selectedConnectorId: parsed.selected.connectorId,
            selectedModel: parsed.selected.model,
            localModelCount: parsed.localRuntime.models.length,
            connectorCount: parsed.connectors.length,
          },
        });

        return parsed;
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
