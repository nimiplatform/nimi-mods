import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createHookClient } from '@nimiplatform/sdk/mod/hook';
import { createAiClient } from '@nimiplatform/sdk/mod/ai';
import { parseRuntimeRouteOptions } from '@nimiplatform/sdk/mod/runtime-route';
import { useAppStore } from '@nimiplatform/sdk/mod/ui';
import { createNarrativeEngineModule } from '../../../narrative-engine/src/index.js';
import {
  VIDEOPLAY_DATA_API_ASSET_BATCH_UPSERT,
  VIDEOPLAY_DATA_API_EPISODE_UPSERT,
  VIDEOPLAY_DATA_API_RELEASE_PUBLISH,
  VIDEOPLAY_DATA_API_RUNTIME_ROUTE_OPTIONS,
  VIDEOPLAY_MOD_ID,
  VIDEOPLAY_OPERATION_TYPE,
  VIDEOPLAY_PIPELINE_CHAIN,
  VIDEOPLAY_REASON,
  type VideoPlayOperationType,
  type VideoPlayPipelineStep,
} from '../contracts.js';
import { toVideoPlayError } from '../errors.js';
import { createHash, createUlid } from '../id.js';
import { runVideoPlayEpisodeProduction } from '../pipeline/orchestrator.js';
import { applyCreatorOperation } from '../storage/operations.js';
import type {
  EpisodeRecord,
  FallbackAuditRecord,
  ReleasePackage,
  RenderedAsset,
  VideoPlayRunEvent,
} from '../types.js';
import type { VideoPlayWorkbenchProps } from '../ui/video-play-workbench.js';

type AppStoreState = {
  setStatusBanner?: (value: { kind: 'warn' | 'error' | 'success' | 'info'; message: string }) => void;
};

function operationLabel(value: VideoPlayOperationType): string {
  return value;
}

function defaultOperationPayload(): string {
  return JSON.stringify({
    shotId: '',
    clipId: '',
    beatId: '',
    visualPrompt: '',
    motionCue: '',
  }, null, 2);
}

function parsePayload(raw: string): Record<string, unknown> {
  const text = String(raw || '').trim();
  if (!text) {
    return {};
  }
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }
  return parsed as Record<string, unknown>;
}

function buildSyntheticVoiceAssets(input: {
  episode: EpisodeRecord;
  operationType: VideoPlayOperationType;
  payload: Record<string, unknown>;
}): RenderedAsset[] {
  const shotId = String(input.payload.shotId || input.payload.baseShotId || '').trim();
  if (!shotId) {
    return [];
  }
  const shot = input.episode.storyboard.shotPlans.find((item) => item.shotId === shotId);
  if (!shot) {
    return [];
  }

  const anchors = [
    { t: 0, viseme: 'A' },
    { t: 320, viseme: 'O' },
    { t: 640, viseme: 'M' },
  ];
  const voiceLine = String(input.payload.voiceLine || `Voice line for ${shot.shotId}`).trim() || `Voice line for ${shot.shotId}`;

  const assets: RenderedAsset[] = [];
  if (input.operationType === VIDEOPLAY_OPERATION_TYPE.GENERATE_VOICE_LINE) {
    assets.push({
      assetId: createUlid(),
      episodeId: input.episode.episodeId,
      shotId: shot.shotId,
      clipId: shot.clipId,
      assetType: 'voice-script',
      uri: `videoplay://voice-script/${input.episode.episodeId}/${shot.shotId}.json`,
      mimeType: 'application/json',
      durationMs: shot.durationMs,
      fps: 1,
      resolution: 'n/a',
      sourceEventIds: [...shot.sourceEventIds],
      routeSource: 'local-runtime',
      metadata: {
        text: voiceLine,
        locale: 'zh',
        fallbackLocale: 'zh',
      },
    });
    assets.push({
      assetId: createUlid(),
      episodeId: input.episode.episodeId,
      shotId: shot.shotId,
      clipId: shot.clipId,
      assetType: 'lip-sync',
      uri: `videoplay://lip-sync/${input.episode.episodeId}/${shot.shotId}.json`,
      mimeType: 'application/json',
      durationMs: shot.durationMs,
      fps: 30,
      resolution: 'n/a',
      sourceEventIds: [...shot.sourceEventIds],
      routeSource: 'local-runtime',
      metadata: {
        anchors,
        source: 'voice-line-generated',
      },
    });
  } else if (input.operationType === VIDEOPLAY_OPERATION_TYPE.APPLY_LIP_SYNC) {
    assets.push({
      assetId: createUlid(),
      episodeId: input.episode.episodeId,
      shotId: shot.shotId,
      clipId: shot.clipId,
      assetType: 'lip-sync',
      uri: `videoplay://lip-sync/${input.episode.episodeId}/${shot.shotId}.json`,
      mimeType: 'application/json',
      durationMs: shot.durationMs,
      fps: 30,
      resolution: 'n/a',
      sourceEventIds: [...shot.sourceEventIds],
      routeSource: 'local-runtime',
      metadata: {
        anchors,
        source: 'manual-lip-sync',
      },
    });
  }
  return assets;
}

export function useVideoPlayController(): VideoPlayWorkbenchProps {
  const hookClient = useMemo(() => createHookClient(VIDEOPLAY_MOD_ID), []);
  const aiClient = useMemo(() => createAiClient(VIDEOPLAY_MOD_ID), []);
  const narrativeEngine = useMemo(() => createNarrativeEngineModule({
    queryData: (capability, query) => hookClient.data.query({
      capability,
      query,
    }),
    generateText: async (payload) => {
      const result = await aiClient.generateText(payload);
      return {
        text: result.text,
      };
    },
  }), [aiClient, hookClient]);
  const setStatusBanner = useAppStore((state) => (state as AppStoreState).setStatusBanner);

  const [projectId, setProjectId] = useState('project-main');
  const [storyId, setStoryId] = useState('story-main');
  const [ingestCursorStart, setIngestCursorStart] = useState('turn-0000');
  const [runStatus, setRunStatus] = useState('IDLE');
  const [loading, setLoading] = useState(false);
  const [rerunStep, setRerunStep] = useState<VideoPlayPipelineStep>('screenplay');
  const [operationType, setOperationType] = useState<VideoPlayOperationType>(VIDEOPLAY_OPERATION_TYPE.UPDATE_SHOT);
  const [operationPayload, setOperationPayload] = useState(defaultOperationPayload());

  const [episodes, setEpisodes] = useState<EpisodeRecord[]>([]);
  const [releases, setReleases] = useState<ReleasePackage[]>([]);
  const [runs, setRuns] = useState<Array<{
    runId: string;
    traceId: string;
    status: string;
    createdAt: string;
    episodeCount: number;
    releaseCandidateCount: number;
  }>>([]);
  const [runEvents, setRunEvents] = useState<VideoPlayRunEvent[]>([]);
  const [fallbackAudits, setFallbackAudits] = useState<FallbackAuditRecord[]>([]);
  const [selectedEpisodeId, setSelectedEpisodeId] = useState('');
  const [lastRebuildScope, setLastRebuildScope] = useState<string | null>(null);
  const [error, setError] = useState<{ reasonCode: string; actionHint: string; message: string } | null>(null);
  const [routeStatuses, setRouteStatuses] = useState<Array<{
    capability: 'chat' | 'image' | 'video';
    source: string;
    model: string;
    connectorId: string;
    ready: boolean;
  }>>([
    { capability: 'chat', source: 'unknown', model: '', connectorId: '', ready: false },
    { capability: 'image', source: 'unknown', model: '', connectorId: '', ready: false },
    { capability: 'video', source: 'unknown', model: '', connectorId: '', ready: false },
  ]);

  const cancelRequestedRef = useRef(false);

  const selectedEpisode = useMemo(
    () => episodes.find((item) => item.episodeId === selectedEpisodeId) || null,
    [episodes, selectedEpisodeId],
  );

  const selectedReleaseCandidate = selectedEpisode?.candidateRelease || null;
  const activeBranchName = selectedEpisode
    ? selectedEpisode.editor.branches[selectedEpisode.editor.activeBranchId]?.name || selectedEpisode.editor.activeBranchId
    : '-';

  const refreshRouteStatuses = useCallback(async () => {
    const capabilities = ['chat', 'image', 'video'] as const;
    const next = await Promise.all(capabilities.map(async (capability) => {
      try {
        const raw = await hookClient.data.query({
          capability: VIDEOPLAY_DATA_API_RUNTIME_ROUTE_OPTIONS,
          query: {
            capability,
            modId: VIDEOPLAY_MOD_ID,
          },
        });
        const parsed = parseRuntimeRouteOptions(raw, { includeResolvedDefault: true });
        if (!parsed) {
          return {
            capability,
            source: 'unknown',
            model: '',
            connectorId: '',
            ready: false,
          };
        }
        return {
          capability,
          source: parsed.selected.source,
          model: parsed.selected.model,
          connectorId: parsed.selected.connectorId,
          ready: true,
        };
      } catch {
        return {
          capability,
          source: 'unknown',
          model: '',
          connectorId: '',
          ready: false,
        };
      }
    }));
    setRouteStatuses(next);
  }, [hookClient]);

  const refreshStorageView = useCallback(async () => {
    try {
      const episodeResponse = await hookClient.data.query({
        capability: VIDEOPLAY_DATA_API_EPISODE_UPSERT,
        query: {
          operation: 'list',
          storyId,
        },
      });
      const list = episodeResponse && typeof episodeResponse === 'object'
        ? (episodeResponse as { episodes?: EpisodeRecord[] }).episodes || []
        : [];
      setEpisodes(list);
      if (!selectedEpisodeId && list.length > 0) {
        setSelectedEpisodeId(list[0]!.episodeId);
      }

      const releaseResponse = await hookClient.data.query({
        capability: VIDEOPLAY_DATA_API_RELEASE_PUBLISH,
        query: {
          operation: 'list',
        },
      });
      const releaseList = releaseResponse && typeof releaseResponse === 'object'
        ? (releaseResponse as { releases?: ReleasePackage[] }).releases || []
        : [];
      setReleases(releaseList);
    } catch (queryError) {
      const message = queryError instanceof Error ? queryError.message : String(queryError || '');
      setStatusBanner?.({
        kind: 'warn',
        message: `VideoPlay state refresh failed: ${message}`,
      });
    }
  }, [hookClient, selectedEpisodeId, setStatusBanner, storyId]);

  useEffect(() => {
    void refreshRouteStatuses();
    void refreshStorageView();
  }, [refreshRouteStatuses, refreshStorageView]);

  const executePipeline = useCallback(async (mode: 'run' | 'rerun-step' | 'continue') => {
    cancelRequestedRef.current = false;
    setRunStatus('RUNNING');
    setError(null);
    setLoading(true);

    try {
      const result = await runVideoPlayEpisodeProduction(
        {
          hookClient,
          aiClient,
          narrativeEngine,
        },
        {
          projectId,
          storyId,
          ingestCursorStart,
          operator: 'creator',
        },
      );

      if (cancelRequestedRef.current) {
        setRunStatus('CANCELED');
        return;
      }

      setEpisodes(result.episodes);
      setRunEvents(result.runEvents);
      setFallbackAudits(result.fallbackAudits);
      if (result.episodes.length > 0) {
        setSelectedEpisodeId(result.episodes[0]!.episodeId);
      }

      setRuns((current) => [{
        runId: result.runId,
        traceId: result.traceId,
        status: 'COMPLETED',
        createdAt: new Date().toISOString(),
        episodeCount: result.episodes.length,
        releaseCandidateCount: result.releaseCandidates.length,
      }, ...current].slice(0, 12));

      await refreshStorageView();
      setRunStatus('COMPLETED');
      setStatusBanner?.({
        kind: 'success',
        message: mode === 'run'
          ? `VideoPlay pipeline completed (${result.episodes.length} episode)`
          : `VideoPlay ${mode} completed (${result.episodes.length} episode)`,
      });
    } catch (pipelineError) {
      const normalized = toVideoPlayError(pipelineError, {
        reasonCode: VIDEOPLAY_REASON.INPUT_INVALID,
        actionHint: 'Fix pipeline input and retry.',
        stage: 'orchestrator',
      });
      setRunStatus('FAILED');
      setError({
        reasonCode: normalized.reasonCode,
        actionHint: normalized.actionHint,
        message: normalized.message,
      });
      setRuns((current) => [{
        runId: createUlid(),
        traceId: createUlid(),
        status: 'FAILED',
        createdAt: new Date().toISOString(),
        episodeCount: 0,
        releaseCandidateCount: 0,
      }, ...current].slice(0, 12));
      setStatusBanner?.({
        kind: 'error',
        message: `${normalized.reasonCode}: ${normalized.actionHint}`,
      });
    } finally {
      setLoading(false);
      await refreshRouteStatuses();
    }
  }, [
    aiClient,
    hookClient,
    ingestCursorStart,
    narrativeEngine,
    projectId,
    refreshRouteStatuses,
    refreshStorageView,
    setStatusBanner,
    storyId,
  ]);

  const handleApplyOperation = useCallback(async () => {
    if (!selectedEpisode) {
      return;
    }
    try {
      const payload = parsePayload(operationPayload);
      const applied = applyCreatorOperation({
        episode: selectedEpisode,
        operationType,
        operator: 'creator',
        payload,
      });

      const episodeIdempotencyKey = createHash(`operation:${selectedEpisode.episodeId}:${operationType}:${JSON.stringify(payload)}`);
      await hookClient.data.query({
        capability: VIDEOPLAY_DATA_API_EPISODE_UPSERT,
        query: {
          operation: 'upsert',
          idempotencyKey: episodeIdempotencyKey,
          episode: applied.episode,
        },
      });

      const syntheticAssets = buildSyntheticVoiceAssets({
        episode: applied.episode,
        operationType,
        payload,
      });
      if (syntheticAssets.length > 0) {
        const assetIdempotencyKey = createHash(`operation:assets:${selectedEpisode.episodeId}:${operationType}:${JSON.stringify(payload)}`);
        await hookClient.data.query({
          capability: VIDEOPLAY_DATA_API_ASSET_BATCH_UPSERT,
          query: {
            operation: 'upsert',
            idempotencyKey: assetIdempotencyKey,
            episodeId: selectedEpisode.episodeId,
            assets: syntheticAssets,
          },
        });
      }

      setLastRebuildScope(applied.rebuildScope);
      await refreshStorageView();
      setSelectedEpisodeId(applied.episode.episodeId);
      setStatusBanner?.({
        kind: 'info',
        message: `Operation applied: ${operationType} · scope=${applied.rebuildScope}`,
      });
    } catch (operationError) {
      const normalized = toVideoPlayError(operationError, {
        reasonCode: VIDEOPLAY_REASON.INPUT_INVALID,
        actionHint: 'Fix operation payload and retry.',
        stage: 'operation',
      });
      setError({
        reasonCode: normalized.reasonCode,
        actionHint: normalized.actionHint,
        message: normalized.message,
      });
    }
  }, [
    hookClient,
    operationPayload,
    operationType,
    refreshStorageView,
    selectedEpisode,
    setStatusBanner,
  ]);

  const handlePublish = useCallback(async () => {
    if (!selectedReleaseCandidate || !selectedEpisode) {
      return;
    }
    if (!(selectedReleaseCandidate.qcStatus === 'APPROVED' || selectedReleaseCandidate.qcStatus === 'ADJUSTED')) {
      return;
    }

    const idempotencyKey = createHash(`publish:${selectedReleaseCandidate.releaseId}`);
    await hookClient.data.query({
      capability: VIDEOPLAY_DATA_API_RELEASE_PUBLISH,
      query: {
        operation: 'publish',
        idempotencyKey,
        episodeId: selectedEpisode.episodeId,
        releasePackage: selectedReleaseCandidate,
      },
    });
    await refreshStorageView();
    setStatusBanner?.({
      kind: 'success',
      message: `Release published: ${selectedReleaseCandidate.releaseId}`,
    });
  }, [hookClient, refreshStorageView, selectedEpisode, selectedReleaseCandidate, setStatusBanner]);

  const operationOptions = useMemo(
    () => (Object.values(VIDEOPLAY_OPERATION_TYPE) as VideoPlayOperationType[]).map((value) => ({
      value,
      label: operationLabel(value),
    })),
    [],
  );

  return {
    title: 'VideoPlay Workbench',
    subtitle: 'Canonical narrative -> episode production package',
    projectId,
    storyId,
    ingestCursorStart,
    runStatus,
    rerunStep,
    operationType,
    operationPayload,
    selectedEpisodeId,
    routeStatuses,
    episodes,
    runs,
    runEvents,
    fallbackAudits,
    releases,
    selectedEpisode,
    selectedReleaseCandidate,
    activeBranchName,
    lastRebuildScope,
    loading,
    error,
    operationOptions,
    onProjectIdChange: setProjectId,
    onStoryIdChange: setStoryId,
    onIngestCursorStartChange: setIngestCursorStart,
    onRerunStepChange: setRerunStep,
    onOperationTypeChange: setOperationType,
    onOperationPayloadChange: setOperationPayload,
    onSelectEpisode: setSelectedEpisodeId,
    onRunPipeline: () => {
      void executePipeline('run');
    },
    onRerunStep: () => {
      setStatusBanner?.({ kind: 'info', message: `Rerun step requested: ${rerunStep}` });
      void executePipeline('rerun-step');
    },
    onContinueFromCheckpoint: () => {
      setStatusBanner?.({ kind: 'info', message: `Continue requested from ${rerunStep}` });
      void executePipeline('continue');
    },
    onCancelRun: () => {
      cancelRequestedRef.current = true;
      setRunStatus('CANCEL_REQUESTED');
    },
    onApplyOperation: () => {
      void handleApplyOperation();
    },
    onPublish: () => {
      void handlePublish();
    },
    onRefresh: () => {
      void refreshRouteStatuses();
      void refreshStorageView();
    },
  };
}

export function pipelineSteps(): readonly VideoPlayPipelineStep[] {
  return VIDEOPLAY_PIPELINE_CHAIN;
}
