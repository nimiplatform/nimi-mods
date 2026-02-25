import type { ModAiClient } from '@nimiplatform/mod-sdk/ai';
import type { RuntimeRouteOverride } from '@nimiplatform/mod-sdk/types';
import type {
  WorldLorebookDraftRow,
  WorldStudioEmbeddingIndex,
  WorldStudioEmbeddingIndexEntry,
  WorldStudioWorkspaceSnapshot,
} from '../contracts.js';

const MAX_EMBEDDING_LOREBOOKS = 64;

export type BuildWorldStudioEmbeddingIndexInput = {
  aiClient: Pick<ModAiClient, 'generateEmbedding'>;
  snapshot: WorldStudioWorkspaceSnapshot;
  routeOverride?: RuntimeRouteOverride | null;
  lorebooksDraft?: WorldLorebookDraftRow[];
};

export type BuildWorldStudioEmbeddingIndexResult = {
  ok: boolean;
  failedCount: number;
  entryCount: number;
  embeddingIndex: WorldStudioEmbeddingIndex;
};

function normalizeLorebookText(lorebook: WorldLorebookDraftRow): string {
  const key = String(lorebook.key || '').trim();
  if (!key) return '';
  // Prefer content over value for embedding text
  if (lorebook.content && typeof lorebook.content === 'string' && lorebook.content.trim()) {
    return `${key}\n${lorebook.content.trim()}`.trim();
  }
  const value = lorebook.value && typeof lorebook.value === 'object'
    ? JSON.stringify(lorebook.value)
    : String(lorebook.value || '').trim();
  return `${key}\n${value}`.trim();
}

function buildLorebookId(lorebook: WorldLorebookDraftRow, index: number): string {
  const source = String(lorebook.id || '').trim();
  if (source) return source;
  const key = String(lorebook.key || '').trim().toLowerCase().replace(/\s+/g, '-');
  return key ? `${key}:${index}` : `lorebook:${index}`;
}

function toRouteSource(binding: RuntimeRouteOverride | null | undefined): 'local-runtime' | 'token-api' | null {
  const source = String(binding?.source || '').trim();
  if (source === 'local-runtime' || source === 'token-api') {
    return source;
  }
  return null;
}

function toRouteModel(binding: RuntimeRouteOverride | null | undefined): string | null {
  const model = String(binding?.model || '').trim();
  return model || null;
}

export async function buildWorldStudioEmbeddingIndex(
  input: BuildWorldStudioEmbeddingIndexInput,
): Promise<BuildWorldStudioEmbeddingIndexResult> {
  const now = new Date().toISOString();
  const lorebooks = (input.lorebooksDraft || input.snapshot.lorebooksDraft || [])
    .slice(0, MAX_EMBEDDING_LOREBOOKS);

  const routeSource = toRouteSource(input.routeOverride);
  const routeModel = toRouteModel(input.routeOverride);

  if (lorebooks.length === 0) {
    return {
      ok: true,
      failedCount: 0,
      entryCount: 0,
      embeddingIndex: {
        status: 'ready',
        lastBuiltAt: now,
        routeSource,
        routeModel,
        entries: {},
        errorMessage: null,
      },
    };
  }

  const payloadItems = lorebooks
    .map((lorebook, index) => {
      const text = normalizeLorebookText(lorebook);
      if (!text) return null;
      return {
        lorebookId: buildLorebookId(lorebook, index),
        text,
      };
    })
    .filter((item): item is { lorebookId: string; text: string } => Boolean(item));

  if (payloadItems.length === 0) {
    return {
      ok: true,
      failedCount: 0,
      entryCount: 0,
      embeddingIndex: {
        status: 'ready',
        lastBuiltAt: now,
        routeSource,
        routeModel,
        entries: {},
        errorMessage: null,
      },
    };
  }

  try {
    const result = await input.aiClient.generateEmbedding({
      routeHint: 'embedding/default',
      ...(input.routeOverride ? { routeOverride: input.routeOverride } : {}),
      input: payloadItems.map((item) => item.text),
    });

    const vectors = Array.isArray(result.embeddings) ? result.embeddings : [];
    const entries: Record<string, WorldStudioEmbeddingIndexEntry> = {};
    let failedCount = 0;

    for (let index = 0; index < payloadItems.length; index += 1) {
      const payload = payloadItems[index];
      if (!payload) {
        failedCount += 1;
        continue;
      }
      const vectorSource = vectors[index];
      const vector = Array.isArray(vectorSource)
        ? vectorSource.map((item) => Number(item)).filter((item) => Number.isFinite(item))
        : [];
      if (vector.length === 0) {
        failedCount += 1;
        continue;
      }
      entries[payload.lorebookId] = {
        text: payload.text,
        vector,
        dimensions: vector.length,
        updatedAt: now,
      };
    }

    const entryCount = Object.keys(entries).length;
    return {
      ok: failedCount === 0,
      failedCount,
      entryCount,
      embeddingIndex: {
        status: failedCount === 0 ? 'ready' : 'failed',
        lastBuiltAt: now,
        routeSource,
        routeModel,
        entries,
        errorMessage: failedCount === 0
          ? null
          : `WORLD_STUDIO_EMBEDDING_PARTIAL_FAILURE: ${failedCount} item(s) failed`,
      },
    };
  } catch (error) {
    return {
      ok: false,
      failedCount: payloadItems.length,
      entryCount: 0,
      embeddingIndex: {
        status: 'failed',
        lastBuiltAt: now,
        routeSource,
        routeModel,
        entries: {},
        errorMessage: error instanceof Error ? error.message : String(error || 'WORLD_STUDIO_EMBEDDING_FAILED'),
      },
    };
  }
}
