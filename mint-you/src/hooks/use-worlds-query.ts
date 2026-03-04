import { useState, useEffect } from 'react';
import { getMintYouHookClient } from '../runtime-mod.js';
import { MINTYOU_DATA_API_WORLDS_MINE } from '../contracts.js';
import { emitMintYouLog } from '../logging.js';

type WorldItem = {
  id: string;
  name: string;
};

export function useWorldsQuery() {
  const [worlds, setWorlds] = useState<WorldItem[]>([]);
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
          capability: MINTYOU_DATA_API_WORLDS_MINE,
          query: {},
        });

        if (cancelled) return;

        const items = Array.isArray(response)
          ? response
          : (response as Record<string, unknown>)?.data;

        if (Array.isArray(items)) {
          setWorlds(items.map((w: Record<string, unknown>) => ({
            id: String(w.id || w.worldId || ''),
            name: String(w.name || w.title || ''),
          })).filter(w => w.id));
        } else {
          setWorlds([]);
        }
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err || '');
        setError(msg);
        emitMintYouLog({
          level: 'warn',
          message: 'action:worlds-query:failed',
          source: 'useWorldsQuery',
          details: { error: msg },
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return { worlds, loading, error };
}
