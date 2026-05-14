import {
  VIDEOPLAY_DATA_API_ASSET_BATCH_UPSERT,
  VIDEOPLAY_DATA_API_EPISODE_UPSERT,
  VIDEOPLAY_MOD_ID,
  VIDEOPLAY_DATA_API_RELEASE_PUBLISH,
  VIDEOPLAY_REASON,
  VIDEOPLAY_STORAGE_KEY,
} from '../contracts.js';
import { createModKvStore, createModStorageClient, type ModKvStore } from '@nimiplatform/sdk/mod';
import { createUlid } from '../id.js';
import { VideoPlayError } from '../errors.js';
import {
  EpisodeRecordSchema,
  ReleasePackageSchema,
  RenderedAssetSchema,
  VideoPlayStorageStateSchema,
} from '../schemas.js';
import type {
  EpisodeRecord,
  ReleasePackage,
  RenderedAsset,
  VideoPlayStorageState,
} from '../types.js';

function nowIso(): string {
  return new Date().toISOString();
}

type LocalStorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

let videoplayStateStore: ModKvStore | null = null;

function getVideoPlayStateStore(): ModKvStore {
  if (!videoplayStateStore) {
    videoplayStateStore = createModKvStore({
      storage: createModStorageClient(VIDEOPLAY_MOD_ID),
      namespace: 'videoplay.state',
    });
  }
  return videoplayStateStore;
}

function getHostlessLocalStorage(): LocalStorageLike | null {
  const hasModSdkHost = Boolean((globalThis as Record<PropertyKey, unknown>)[Symbol.for('nimi.mod.sdk.host')]);
  if (hasModSdkHost) {
    return null;
  }
  const storage = (globalThis as { localStorage?: Partial<LocalStorageLike> }).localStorage;
  if (typeof storage?.getItem === 'function' && typeof storage.setItem === 'function') {
    return storage as LocalStorageLike;
  }
  return null;
}

export function createInitialVideoPlayState(): VideoPlayStorageState {
  return {
    version: 1,
    episodesById: {},
    assetsByEpisodeId: {},
    releasesById: {},
    releaseIdsByEpisodeId: {},
    idempotency: {},
    operationAudit: [],
    characterCastingByStoryId: {},
    scenePlanningByStoryId: {},
    candidateSelectionByEpisodeId: {},
    audioDesignByEpisodeId: {},
  };
}

function parseVideoPlayStorageState(value: unknown, fallback: VideoPlayStorageState): VideoPlayStorageState {
  const parsed = VideoPlayStorageStateSchema.safeParse(value);
  if (!parsed.success) {
    return fallback;
  }
  return parsed.data;
}

export function loadVideoPlayState(): VideoPlayStorageState | Promise<VideoPlayStorageState> {
  const fallback = createInitialVideoPlayState();
  const localStorage = getHostlessLocalStorage();
  if (localStorage) {
    try {
      const raw = localStorage.getItem(VIDEOPLAY_STORAGE_KEY);
      const loaded = raw ? JSON.parse(raw) : fallback;
      return parseVideoPlayStorageState(loaded, fallback);
    } catch {
      return fallback;
    }
  }

  return getVideoPlayStateStore()
    .getJson<VideoPlayStorageState>(VIDEOPLAY_STORAGE_KEY)
    .then((loaded) => parseVideoPlayStorageState(loaded || fallback, fallback));
}

export function saveVideoPlayState(state: VideoPlayStorageState): void | Promise<void> {
  const parsed = VideoPlayStorageStateSchema.safeParse(state);
  if (!parsed.success) {
    throw new VideoPlayError({
      reasonCode: VIDEOPLAY_REASON.INPUT_INVALID,
      actionHint: 'Fix persistence payload and retry.',
      stage: 'persistence',
      message: 'VIDEOPLAY_STORAGE_INVALID_SHAPE',
      details: {
        issues: parsed.error.issues.map((item) => `${item.path.join('.')}:${item.message}`),
      },
    });
  }

  const localStorage = getHostlessLocalStorage();
  if (localStorage) {
    try {
      localStorage.setItem(VIDEOPLAY_STORAGE_KEY, JSON.stringify(parsed.data));
    } catch {
      // Hostless tests and previews should fail closed to an empty state on the next read.
    }
    return;
  }

  return getVideoPlayStateStore().setJson(VIDEOPLAY_STORAGE_KEY, parsed.data);
}

function idempotencyKeyFor(capability: string, operation: string, key: string): string {
  return `${capability}:${operation}:${key}`;
}

function getIdempotentResult(state: VideoPlayStorageState, capability: string, operation: string, key: string): unknown | null {
  const mapKey = idempotencyKeyFor(capability, operation, key);
  if (mapKey in state.idempotency) {
    return state.idempotency[mapKey];
  }
  return null;
}

function setIdempotentResult(
  state: VideoPlayStorageState,
  capability: string,
  operation: string,
  key: string,
  value: unknown,
): void {
  const mapKey = idempotencyKeyFor(capability, operation, key);
  state.idempotency[mapKey] = value;
}

export function upsertEpisode(
  state: VideoPlayStorageState,
  input: {
    idempotencyKey: string;
    episode: EpisodeRecord;
  },
): { episode: EpisodeRecord } {
  const reused = getIdempotentResult(
    state,
    VIDEOPLAY_DATA_API_EPISODE_UPSERT,
    'upsert',
    input.idempotencyKey,
  );
  if (reused) {
    return reused as { episode: EpisodeRecord };
  }

  const parsed = EpisodeRecordSchema.safeParse(input.episode);
  if (!parsed.success) {
    throw new VideoPlayError({
      reasonCode: VIDEOPLAY_REASON.INPUT_INVALID,
      actionHint: 'Fix episode payload schema and retry.',
      stage: 'persistence',
      message: 'VIDEOPLAY_EPISODE_UPSERT_INVALID',
      details: {
        issues: parsed.error.issues.map((item) => `${item.path.join('.')}:${item.message}`),
      },
    });
  }

  const current = state.episodesById[parsed.data.episodeId] || null;
  const next: EpisodeRecord = {
    ...parsed.data,
    createdAt: current?.createdAt || parsed.data.createdAt || nowIso(),
    updatedAt: nowIso(),
  };
  state.episodesById[next.episodeId] = next;
  const response = { episode: next };
  setIdempotentResult(state, VIDEOPLAY_DATA_API_EPISODE_UPSERT, 'upsert', input.idempotencyKey, response);
  return response;
}

export function getEpisode(state: VideoPlayStorageState, episodeId: string): { episode: EpisodeRecord | null } {
  return {
    episode: state.episodesById[String(episodeId || '').trim()] || null,
  };
}

export function listEpisodes(state: VideoPlayStorageState, storyId?: string): { episodes: EpisodeRecord[] } {
  const rows = Object.values(state.episodesById).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (!storyId) {
    return { episodes: rows };
  }
  return {
    episodes: rows.filter((item) => item.storyId === storyId),
  };
}

export function upsertAssets(
  state: VideoPlayStorageState,
  input: {
    idempotencyKey: string;
    episodeId: string;
    assets: RenderedAsset[];
  },
): {
  assetBatchResult: {
    episodeId: string;
    writeCount: number;
  };
} {
  const reused = getIdempotentResult(
    state,
    VIDEOPLAY_DATA_API_ASSET_BATCH_UPSERT,
    'upsert',
    input.idempotencyKey,
  );
  if (reused) {
    return reused as { assetBatchResult: { episodeId: string; writeCount: number } };
  }

  const normalizedEpisodeId = String(input.episodeId || '').trim();
  if (!normalizedEpisodeId) {
    throw new VideoPlayError({
      reasonCode: VIDEOPLAY_REASON.INPUT_INVALID,
      actionHint: 'Provide episodeId before asset upsert.',
      stage: 'persistence',
      message: 'VIDEOPLAY_ASSET_UPSERT_EPISODE_REQUIRED',
    });
  }

  const validated: RenderedAsset[] = [];
  for (const asset of input.assets) {
    const parsed = RenderedAssetSchema.safeParse(asset);
    if (!parsed.success) {
      throw new VideoPlayError({
        reasonCode: VIDEOPLAY_REASON.INPUT_INVALID,
        actionHint: 'Fix asset payload schema and retry.',
        stage: 'persistence',
        message: 'VIDEOPLAY_ASSET_UPSERT_INVALID',
        details: {
          issues: parsed.error.issues.map((item) => `${item.path.join('.')}:${item.message}`),
        },
      });
    }
    validated.push(parsed.data);
  }

  const existing = state.assetsByEpisodeId[normalizedEpisodeId] || [];
  const map = new Map(existing.map((asset) => [asset.assetId, asset]));
  for (const asset of validated) {
    map.set(asset.assetId, asset);
  }
  state.assetsByEpisodeId[normalizedEpisodeId] = [...map.values()];

  const response = {
    assetBatchResult: {
      episodeId: normalizedEpisodeId,
      writeCount: validated.length,
    },
  };
  setIdempotentResult(state, VIDEOPLAY_DATA_API_ASSET_BATCH_UPSERT, 'upsert', input.idempotencyKey, response);
  return response;
}

export function listAssets(state: VideoPlayStorageState, episodeId: string): { assets: RenderedAsset[] } {
  const normalizedEpisodeId = String(episodeId || '').trim();
  return {
    assets: [...(state.assetsByEpisodeId[normalizedEpisodeId] || [])],
  };
}

export function publishRelease(
  state: VideoPlayStorageState,
  input: {
    idempotencyKey: string;
    episodeId: string;
    releasePackage: ReleasePackage;
  },
): {
  releaseRecord: ReleasePackage;
} {
  const reused = getIdempotentResult(
    state,
    VIDEOPLAY_DATA_API_RELEASE_PUBLISH,
    'publish',
    input.idempotencyKey,
  );
  if (reused) {
    return reused as { releaseRecord: ReleasePackage };
  }

  const parsed = ReleasePackageSchema.safeParse(input.releasePackage);
  if (!parsed.success) {
    throw new VideoPlayError({
      reasonCode: VIDEOPLAY_REASON.RELEASE_PACKAGE_INVALID,
      actionHint: 'Complete release package minimum fields and retry.',
      stage: 'package',
      message: 'VIDEOPLAY_RELEASE_SCHEMA_INVALID',
      details: {
        issues: parsed.error.issues.map((item) => `${item.path.join('.')}:${item.message}`),
      },
    });
  }

  if (parsed.data.episodeId !== input.episodeId) {
    throw new VideoPlayError({
      reasonCode: VIDEOPLAY_REASON.RELEASE_PACKAGE_INVALID,
      actionHint: 'Align episodeId and releasePackage.episodeId before publish.',
      stage: 'package',
      message: 'VIDEOPLAY_RELEASE_EPISODE_MISMATCH',
    });
  }

  const releaseId = parsed.data.releaseId || createUlid();
  const releaseRecord: ReleasePackage = {
    ...parsed.data,
    releaseId,
    published: true,
    publishedAt: nowIso(),
  };
  state.releasesById[releaseId] = releaseRecord;
  const ids = state.releaseIdsByEpisodeId[releaseRecord.episodeId] || [];
  if (!ids.includes(releaseId)) {
    ids.push(releaseId);
  }
  state.releaseIdsByEpisodeId[releaseRecord.episodeId] = ids;

  const response = { releaseRecord };
  setIdempotentResult(state, VIDEOPLAY_DATA_API_RELEASE_PUBLISH, 'publish', input.idempotencyKey, response);
  return response;
}

export function getRelease(state: VideoPlayStorageState, releaseId: string): { releaseRecord: ReleasePackage | null } {
  return {
    releaseRecord: state.releasesById[String(releaseId || '').trim()] || null,
  };
}

export function listReleases(state: VideoPlayStorageState, episodeId?: string): { releases: ReleasePackage[] } {
  const rows = Object.values(state.releasesById).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (!episodeId) {
    return { releases: rows };
  }
  return {
    releases: rows.filter((item) => item.episodeId === episodeId),
  };
}
