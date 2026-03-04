import { useEffect, useState } from 'react';
import { getMintYouHookClient } from '../runtime-mod.js';
import { MINTYOU_DATA_API_WORLD_OASIS_GET } from '../contracts.js';
import { emitMintYouLog } from '../logging.js';

type OasisWorld = {
  id: string;
  name: string;
};

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function toStringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeOasisWorld(payload: unknown): OasisWorld | null {
  const root = toRecord(payload);
  const nested = toRecord(root.data);
  const id = toStringOrEmpty(root.id)
    || toStringOrEmpty(root.worldId)
    || toStringOrEmpty(nested.id)
    || toStringOrEmpty(nested.worldId);
  if (!id) return null;
  const name = toStringOrEmpty(root.name)
    || toStringOrEmpty(root.title)
    || toStringOrEmpty(nested.name)
    || toStringOrEmpty(nested.title)
    || 'OASIS';
  return { id, name };
}

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
        const normalized = normalizeOasisWorld(response);
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
