import { useEffect, useState } from 'react';
import { getMintYouHookClient } from '../runtime-mod.js';
import { MINTYOU_DATA_API_WORLD_OASIS_GET } from '../contracts.js';
import { emitMintYouLog } from '../logging.js';
import {
  type OasisWorld,
  parseOasisWorld,
} from '../realm-contract.js';

export function useOasisWorldQuery() {
  const [world, setWorld] = useState<OasisWorld | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const hookClient = getMintYouHookClient();
        const response = await hookClient.data.query({
          capability: MINTYOU_DATA_API_WORLD_OASIS_GET,
          query: {},
        });
        if (cancelled) return;
        const normalized = parseOasisWorld(response);
        if (!normalized) {
          setWorld(null);
          setError('OASIS world is unavailable.');
          return;
        }
        setWorld(normalized);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err || '');
        setWorld(null);
        setError(msg || 'OASIS world is unavailable.');
        emitMintYouLog({
          level: 'warn',
          message: 'action:oasis-world-query:failed',
          source: 'useOasisWorldQuery',
          details: { error: msg },
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { world, loading, error };
}
