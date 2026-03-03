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
  VIDEOPLAY_STORY_SOURCE_MODE,
  VIDEOPLAY_WORKBENCH_STAGE,
  type VideoPlayOperationType,
  type VideoPlayPipelineStep,
  type VideoPlayReasonCode,
  type VideoPlayWorkbenchStage,
  type VideoStorySourceMode,
} from '../contracts.js';
import { toVideoPlayError } from '../errors.js';
import { createHash, createUlid } from '../id.js';
import {
  listPlayableVideoStories,
  loadVideoStoryPackage,
} from '../data/story-package.js';
import { runVideoPlayEpisodeProduction } from '../pipeline/orchestrator.js';
import {
  buildGeneratedVoiceAssets,
  buildManualLipSyncAssets,
} from '../operations/voice-assets.js';
import { applyCreatorOperation } from '../storage/operations.js';
import type {
  EpisodeRecord,
  FallbackAuditRecord,
  ReleasePackage,
  RenderedAsset,
  VideoPlayPipelineCheckpoint,
  VideoPlayRebuildImpactPreview,
  VideoPlayStageAdvancePlan,
  VideoPlayPipelineStageProgress,
  VideoPlayRunEvent,
  VideoPlayWorkbenchStageProgress,
  VideoStoryPackage,
  VideoStorySummary,
} from '../types.js';
import type { VideoPlayWorkbenchProps } from '../ui/video-play-workbench.js';
import {
  buildRebuildImpactPreview,
  computeStageAdvancePlan,
  deriveWorkbenchStageProgress,
} from '../workbench/stage-flow.js';

type AppStoreState = {
  setStatusBanner?: (value: { kind: 'warn' | 'error' | 'success' | 'info'; message: string }) => void;
};

type ControllerError = {
  reasonCode: string;
  actionHint: string;
  message: string;
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

function toControllerError(
  error: unknown,
  fallback: { reasonCode: VideoPlayReasonCode; actionHint: string; stage: string },
): ControllerError {
  const normalized = toVideoPlayError(error, fallback);
  return {
    reasonCode: normalized.reasonCode,
    actionHint: normalized.actionHint,
    message: normalized.message,
  };
}

function createInitialStageProgress(): VideoPlayPipelineStageProgress[] {
  const now = new Date().toISOString();
  return [...VIDEOPLAY_PIPELINE_CHAIN].map((step) => ({
    step,
    status: 'PENDING',
    attempt: 0,
    checkpointToken: null,
    stepInputHash: null,
    lastCompletedUnit: null,
    reasonCode: null,
    actionHint: null,
    updatedAt: now,
  }));
}

function stageFromNextStep(step: VideoPlayPipelineStep | null): VideoPlayWorkbenchStage {
  if (step === 'narrative-ingest') {
    return VIDEOPLAY_WORKBENCH_STAGE.STORY_SOURCE;
  }
  if (step === 'episode-segmentation' || step === 'screenplay') {
    return VIDEOPLAY_WORKBENCH_STAGE.SCRIPT;
  }
  if (step === 'storyboard') {
    return VIDEOPLAY_WORKBENCH_STAGE.STORYBOARD;
  }
  if (step === 'asset-render') {
    return VIDEOPLAY_WORKBENCH_STAGE.VOICE;
  }
  if (step === 'edit-compose') {
    return VIDEOPLAY_WORKBENCH_STAGE.VIDEO;
  }
  if (step === 'qc-gate') {
    return VIDEOPLAY_WORKBENCH_STAGE.QC;
  }
  if (step === 'release-package') {
    return VIDEOPLAY_WORKBENCH_STAGE.PUBLISH;
  }
  return VIDEOPLAY_WORKBENCH_STAGE.STORY_SOURCE;
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

  const [worldId, setWorldId] = useState('world-main');
  const [projectId, setProjectId] = useState('project-main');
  const [ingestCursorStart, setIngestCursorStart] = useState('turn-0000');
  const [stories, setStories] = useState<VideoStorySummary[]>([]);
  const [selectedStoryId, setSelectedStoryId] = useState('');
  const [sourceMode, setSourceMode] = useState<VideoStorySourceMode>(VIDEOPLAY_STORY_SOURCE_MODE.CANONICAL);
  const [storyPackage, setStoryPackage] = useState<VideoStoryPackage | null>(null);
  const [storyPackageLoading, setStoryPackageLoading] = useState(false);
  const [storyPackageError, setStoryPackageError] = useState<ControllerError | null>(null);

  const [runStatus, setRunStatus] = useState('IDLE');
  const [loading, setLoading] = useState(false);
  const [pipelineCheckpoint, setPipelineCheckpoint] = useState<VideoPlayPipelineCheckpoint | null>(null);
  const [stageProgress, setStageProgress] = useState<VideoPlayPipelineStageProgress[]>(createInitialStageProgress);
  const [nextStep, setNextStep] = useState<VideoPlayPipelineStep | null>(null);
  const [selectedWorkbenchStage, setSelectedWorkbenchStage] = useState<VideoPlayWorkbenchStage>(
    VIDEOPLAY_WORKBENCH_STAGE.STORY_SOURCE,
  );
  const [rerunStep, setRerunStep] = useState<VideoPlayPipelineStep>('screenplay');
  const [operationType, setOperationType] = useState<VideoPlayOperationType>(VIDEOPLAY_OPERATION_TYPE.UPDATE_SHOT);
  const [operationPayload, setOperationPayload] = useState(defaultOperationPayload());
  const [rebuildPreview, setRebuildPreview] = useState<VideoPlayRebuildImpactPreview | null>(null);

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
  const [error, setError] = useState<ControllerError | null>(null);
  const [routeStatuses, setRouteStatuses] = useState<Array<{
    capability: 'chat' | 'image' | 'video' | 'tts';
    source: string;
    model: string;
    connectorId: string;
    ready: boolean;
  }>>([
    { capability: 'chat', source: 'unknown', model: '', connectorId: '', ready: false },
    { capability: 'image', source: 'unknown', model: '', connectorId: '', ready: false },
    { capability: 'video', source: 'unknown', model: '', connectorId: '', ready: false },
    { capability: 'tts', source: 'unknown', model: '', connectorId: '', ready: false },
  ]);

  const cancelRequestedRef = useRef(false);
  const storyPackageLoadSeqRef = useRef(0);

  const selectedStory = useMemo(
    () => stories.find((item) => item.storyId === selectedStoryId) || null,
    [stories, selectedStoryId],
  );

  const selectedEpisode = useMemo(
    () => episodes.find((item) => item.episodeId === selectedEpisodeId) || null,
    [episodes, selectedEpisodeId],
  );

  const routeReady = useMemo(
    () => routeStatuses.every((item) => item.ready),
    [routeStatuses],
  );

  const selectedReleaseCandidate = selectedEpisode?.candidateRelease || null;
  const activeBranchName = selectedEpisode
    ? selectedEpisode.editor.branches[selectedEpisode.editor.activeBranchId]?.name || selectedEpisode.editor.activeBranchId
    : '-';

  const workbenchStages = useMemo<VideoPlayWorkbenchStageProgress[]>(
    () => deriveWorkbenchStageProgress({
      storySelected: Boolean(selectedStory),
      storyPackageReady: Boolean(storyPackage) && !storyPackageLoading,
      routeReady,
      stageProgress,
      selectedReleaseCandidate,
    }),
    [routeReady, selectedReleaseCandidate, selectedStory, stageProgress, storyPackage, storyPackageLoading],
  );

  const stageAdvancePlan = useMemo<VideoPlayStageAdvancePlan>(
    () => computeStageAdvancePlan({
      stage: selectedWorkbenchStage,
      stageProgress,
      checkpointAvailable: Boolean(pipelineCheckpoint),
      storySelected: Boolean(selectedStory),
      storyPackageReady: Boolean(storyPackage) && !storyPackageLoading,
      routeReady,
      selectedReleaseCandidate,
    }),
    [
      pipelineCheckpoint,
      routeReady,
      selectedReleaseCandidate,
      selectedStory,
      selectedWorkbenchStage,
      stageProgress,
      storyPackage,
      storyPackageLoading,
    ],
  );

  const refreshRouteStatuses = useCallback(async () => {
    const capabilities = ['chat', 'image', 'video', 'tts'] as const;
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

  const refreshStoryCatalog = useCallback(async () => {
    try {
      const catalog = await listPlayableVideoStories({
        hookClient,
        worldId,
      });
      setStories(catalog);
      setSelectedStoryId((current) => {
        if (current && catalog.some((item) => item.storyId === current)) {
          return current;
        }
        return catalog[0]?.storyId || '';
      });
      if (catalog.length === 0) {
        setStoryPackage(null);
        setStoryPackageError({
          reasonCode: VIDEOPLAY_REASON.STORY_SOURCE_UNAVAILABLE,
          actionHint: 'Create PRIMARY world event projection first.',
          message: 'No playable PRIMARY stories found.',
        });
      } else {
        setStoryPackageError(null);
      }
    } catch (catalogError) {
      const normalized = toControllerError(catalogError, {
        reasonCode: VIDEOPLAY_REASON.STORY_SOURCE_UNAVAILABLE,
        actionHint: 'Enable story source capabilities and retry catalog load.',
        stage: 'story-catalog',
      });
      setStories([]);
      setSelectedStoryId('');
      setStoryPackage(null);
      setStoryPackageError(normalized);
      setStatusBanner?.({
        kind: 'error',
        message: `${normalized.reasonCode}: ${normalized.actionHint}`,
      });
    }
  }, [hookClient, setStatusBanner, worldId]);

  const refreshStorageView = useCallback(async () => {
    try {
      const episodeResponse = await hookClient.data.query({
        capability: VIDEOPLAY_DATA_API_EPISODE_UPSERT,
        query: {
          operation: 'list',
          ...(selectedStoryId ? { storyId: selectedStoryId } : {}),
        },
      });
      const list = episodeResponse && typeof episodeResponse === 'object'
        ? (episodeResponse as { episodes?: EpisodeRecord[] }).episodes || []
        : [];
      setEpisodes(list);
      if (list.length === 0) {
        setSelectedEpisodeId('');
      } else if (!list.some((item) => item.episodeId === selectedEpisodeId)) {
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
  }, [hookClient, selectedEpisodeId, selectedStoryId, setStatusBanner]);

  const resetRunSurface = useCallback(() => {
    setRunStatus('IDLE');
    setRuns([]);
    setRunEvents([]);
    setFallbackAudits([]);
    setPipelineCheckpoint(null);
    setStageProgress(createInitialStageProgress());
    setNextStep(null);
    setEpisodes([]);
    setSelectedEpisodeId('');
    setLastRebuildScope(null);
    setRebuildPreview(null);
    setSelectedWorkbenchStage(VIDEOPLAY_WORKBENCH_STAGE.STORY_SOURCE);
    setError(null);
  }, []);

  const loadSelectedStoryPackage = useCallback(async () => {
    if (!selectedStory) {
      setStoryPackage(null);
      setStoryPackageError(null);
      return;
    }

    setStoryPackageLoading(true);
    setStoryPackageError(null);
    const seq = storyPackageLoadSeqRef.current + 1;
    storyPackageLoadSeqRef.current = seq;

    try {
      const nextPackage = await loadVideoStoryPackage({
        hookClient,
        narrativeEngine,
        worldId,
        storyId: selectedStory.storyId,
        projectId,
        ingestCursorStart,
        sourceMode,
        runtimeAgentId: selectedStory.primaryAgentId || undefined,
      });
      if (storyPackageLoadSeqRef.current !== seq) {
        return;
      }
      setStoryPackage(nextPackage);
      setStoryPackageError(null);
    } catch (packageError) {
      if (storyPackageLoadSeqRef.current !== seq) {
        return;
      }
      const normalized = toControllerError(packageError, {
        reasonCode: VIDEOPLAY_REASON.STORY_PACKAGE_INVALID,
        actionHint: 'Repair story package source data and reload.',
        stage: 'story-package',
      });
      setStoryPackage(null);
      setStoryPackageError(normalized);
      setStatusBanner?.({
        kind: 'error',
        message: `${normalized.reasonCode}: ${normalized.actionHint}`,
      });
    } finally {
      if (storyPackageLoadSeqRef.current === seq) {
        setStoryPackageLoading(false);
      }
    }
  }, [
    hookClient,
    ingestCursorStart,
    narrativeEngine,
    projectId,
    selectedStory,
    setStatusBanner,
    sourceMode,
    worldId,
  ]);

  useEffect(() => {
    void refreshRouteStatuses();
  }, [refreshRouteStatuses]);

  useEffect(() => {
    void refreshStoryCatalog();
  }, [refreshStoryCatalog]);

  useEffect(() => {
    void refreshStorageView();
  }, [refreshStorageView]);

  useEffect(() => {
    resetRunSurface();
    if (!selectedStoryId) {
      setStoryPackage(null);
      setStoryPackageError(null);
      return;
    }
    void loadSelectedStoryPackage();
  }, [
    ingestCursorStart,
    loadSelectedStoryPackage,
    projectId,
    resetRunSurface,
    selectedStoryId,
    sourceMode,
    worldId,
  ]);

  useEffect(() => {
    if (!nextStep) {
      return;
    }
    setSelectedWorkbenchStage(stageFromNextStep(nextStep));
  }, [nextStep]);

  const executePipeline = useCallback(async (input: {
    mode: 'run' | 'rerun-step' | 'continue';
    stepBudget?: number;
    rerunStepOverride?: VideoPlayPipelineStep;
    checkpointOverride?: VideoPlayPipelineCheckpoint | null;
  }) => {
    const mode = input.mode;
    const stepBudget = Number.isFinite(Number(input.stepBudget))
      ? Math.max(1, Math.floor(Number(input.stepBudget)))
      : 1;
    const effectiveRerunStep = input.rerunStepOverride || rerunStep;
    const effectiveCheckpoint = mode === 'run'
      ? null
      : (input.checkpointOverride !== undefined ? input.checkpointOverride : pipelineCheckpoint);
    if (!selectedStory) {
      const blockingError: ControllerError = {
        reasonCode: VIDEOPLAY_REASON.STORY_SOURCE_UNAVAILABLE,
        actionHint: 'Select a playable story first.',
        message: 'No story selected.',
      };
      setError(blockingError);
      setStatusBanner?.({ kind: 'warn', message: `${blockingError.reasonCode}: ${blockingError.actionHint}` });
      return;
    }
    if (!routeReady) {
      const blockingError: ControllerError = {
        reasonCode: VIDEOPLAY_REASON.ROUTE_UNAVAILABLE,
        actionHint: 'Ensure chat/image/video/tts routes are ready.',
        message: 'Route not ready for at least one capability.',
      };
      setError(blockingError);
      setStatusBanner?.({ kind: 'warn', message: `${blockingError.reasonCode}: ${blockingError.actionHint}` });
      return;
    }
    if (storyPackageLoading || !storyPackage) {
      const baseError = storyPackageError || {
        reasonCode: VIDEOPLAY_REASON.STORY_PACKAGE_INVALID,
        actionHint: 'Wait for story package ready and retry.',
        message: 'Story package is not ready.',
      };
      setError(baseError);
      setStatusBanner?.({ kind: 'warn', message: `${baseError.reasonCode}: ${baseError.actionHint}` });
      return;
    }
    if ((mode === 'continue' || mode === 'rerun-step') && !effectiveCheckpoint) {
      const blockingError: ControllerError = {
        reasonCode: VIDEOPLAY_REASON.CHECKPOINT_INVALID,
        actionHint: 'Start pipeline first to create a checkpoint.',
        message: 'Checkpoint is not available.',
      };
      setError(blockingError);
      setStatusBanner?.({ kind: 'warn', message: `${blockingError.reasonCode}: ${blockingError.actionHint}` });
      return;
    }

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
          storyId: selectedStory.storyId,
          ingestCursorStart: storyPackage.turnWindow.ingestCursorStart,
          sourceMode,
          storyPackage,
          windowPolicy: storyPackage.windowPolicy,
          operator: 'creator',
          execution: {
            mode: 'stepwise',
            stepBudget,
            checkpoint: effectiveCheckpoint,
            ...(mode === 'rerun-step' ? { rerunStep: effectiveRerunStep } : {}),
            shouldCancel: () => cancelRequestedRef.current,
          },
        },
      );

      setRunStatus(result.status);
      setPipelineCheckpoint(result.checkpoint);
      setStageProgress(result.stageProgress);
      setNextStep(result.nextStep);
      setEpisodes(result.episodes);
      setRunEvents(result.runEvents);
      setFallbackAudits(result.fallbackAudits);
      if (mode === 'rerun-step') {
        setRebuildPreview(null);
      }
      if (result.episodes.length > 0) {
        setSelectedEpisodeId(result.episodes[0]!.episodeId);
      }

      setRuns((current) => {
        const nextRecord = {
          runId: result.runId,
          traceId: result.traceId,
          status: result.status,
          createdAt: new Date().toISOString(),
          episodeCount: result.episodes.length,
          releaseCandidateCount: result.releaseCandidates.length,
        };
        const exists = current.some((item) => item.runId === result.runId);
        if (exists) {
          return current.map((item) => (item.runId === result.runId ? nextRecord : item));
        }
        return [nextRecord, ...current].slice(0, 12);
      });

      if (result.status === 'COMPLETED') {
        await refreshStorageView();
        setStatusBanner?.({
          kind: 'success',
          message: `VideoPlay pipeline completed (${result.episodes.length} episode)`,
        });
      } else if (result.status === 'PAUSED') {
        setStatusBanner?.({
          kind: 'info',
          message: `Checkpoint ready at ${result.nextStep || 'completed'}. Continue to advance next stage.`,
        });
      } else if (result.status === 'CANCELED') {
        setStatusBanner?.({
          kind: 'warn',
          message: 'Run canceled.',
        });
      }
    } catch (pipelineError) {
      const checkpointFromError = (
        pipelineError && typeof pipelineError === 'object'
          ? (pipelineError as { details?: { checkpoint?: VideoPlayPipelineCheckpoint } }).details?.checkpoint
          : undefined
      ) || null;
      if (checkpointFromError) {
        setPipelineCheckpoint(checkpointFromError);
        setStageProgress(checkpointFromError.stageProgress);
        setRunEvents(checkpointFromError.runEvents);
        setFallbackAudits(checkpointFromError.fallbackAudits);
        setNextStep(VIDEOPLAY_PIPELINE_CHAIN[checkpointFromError.nextStepIndex] || null);
      }

      const normalized = toControllerError(pipelineError, {
        reasonCode: VIDEOPLAY_REASON.INPUT_INVALID,
        actionHint: 'Fix pipeline input and retry.',
        stage: 'orchestrator',
      });
      setRunStatus('FAILED');
      setError(normalized);
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
    narrativeEngine,
    projectId,
    refreshRouteStatuses,
    refreshStorageView,
    routeReady,
    selectedStory,
    setStatusBanner,
    sourceMode,
    pipelineCheckpoint,
    rerunStep,
    storyPackage,
    storyPackageError,
    storyPackageLoading,
  ]);

  const handleApplyOperation = useCallback(async () => {
    if (!selectedEpisode) {
      return;
    }
    try {
      const payload = parsePayload(operationPayload);
      if (operationType === VIDEOPLAY_OPERATION_TYPE.GENERATE_VOICE_LINE) {
        const ttsReady = routeStatuses.find((item) => item.capability === 'tts')?.ready;
        if (!ttsReady) {
          throw new Error('VIDEOPLAY_TTS_ROUTE_NOT_READY');
        }
      }
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

      let operationAssets: RenderedAsset[] = [];
      if (operationType === VIDEOPLAY_OPERATION_TYPE.GENERATE_VOICE_LINE) {
        const generated = await buildGeneratedVoiceAssets({
          hookClient,
          aiClient,
          traceId: createUlid(),
          episode: applied.episode,
          payload,
        });
        operationAssets = generated.assets;
        const fallbackAudit = generated.fallbackAudit;
        if (fallbackAudit) {
          setFallbackAudits((current) => [fallbackAudit, ...current].slice(0, 50));
        }
      } else if (operationType === VIDEOPLAY_OPERATION_TYPE.APPLY_LIP_SYNC) {
        operationAssets = buildManualLipSyncAssets({
          episode: applied.episode,
          operationType,
          payload,
        });
      }

      if (operationAssets.length > 0) {
        const assetIdempotencyKey = createHash(`operation:assets:${selectedEpisode.episodeId}:${operationType}:${JSON.stringify(payload)}`);
        await hookClient.data.query({
          capability: VIDEOPLAY_DATA_API_ASSET_BATCH_UPSERT,
          query: {
            operation: 'upsert',
            idempotencyKey: assetIdempotencyKey,
            episodeId: selectedEpisode.episodeId,
            assets: operationAssets,
          },
        });
      }

      setLastRebuildScope(applied.rebuildScope);
      const preview = buildRebuildImpactPreview({
        operationType,
        scope: applied.rebuildScope,
      });
      setRebuildPreview(preview);
      setRerunStep(preview.recommendedRerunStep);
      setSelectedWorkbenchStage(preview.stage);
      await refreshStorageView();
      setSelectedEpisodeId(applied.episode.episodeId);
      setStatusBanner?.({
        kind: 'info',
        message: `Operation applied: ${operationType} · scope=${applied.rebuildScope}. Confirm rebuild preview before rerun.`,
      });
    } catch (operationError) {
      const normalized = toControllerError(operationError, {
        reasonCode: operationType === VIDEOPLAY_OPERATION_TYPE.GENERATE_VOICE_LINE
          ? VIDEOPLAY_REASON.ROUTE_UNAVAILABLE
          : VIDEOPLAY_REASON.INPUT_INVALID,
        actionHint: operationType === VIDEOPLAY_OPERATION_TYPE.GENERATE_VOICE_LINE
          ? 'Ensure TTS route/voice profile is ready and retry.'
          : 'Fix operation payload and retry.',
        stage: 'operation',
      });
      setError(normalized);
    }
  }, [
    aiClient,
    hookClient,
    operationPayload,
    operationType,
    routeStatuses,
    refreshStorageView,
    selectedEpisode,
    setFallbackAudits,
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

  const handleRunPipeline = useCallback(() => {
    setSelectedWorkbenchStage(VIDEOPLAY_WORKBENCH_STAGE.STORY_SOURCE);
    setRebuildPreview(null);
    void executePipeline({
      mode: 'run',
      stepBudget: 1,
      checkpointOverride: null,
    });
  }, [executePipeline]);

  const handleAdvanceStage = useCallback(() => {
    if (!stageAdvancePlan.allowed) {
      const blockedError: ControllerError = {
        reasonCode: stageAdvancePlan.reasonCode || VIDEOPLAY_REASON.STAGE_PRECONDITION_BLOCKED,
        actionHint: stageAdvancePlan.actionHint || 'Complete required upstream outputs before advance.',
        message: `Stage ${selectedWorkbenchStage} is blocked.`,
      };
      setError(blockedError);
      setStatusBanner?.({
        kind: 'warn',
        message: `${blockedError.reasonCode}: ${blockedError.actionHint}`,
      });
      return;
    }
    setError(null);
    setStatusBanner?.({
      kind: 'info',
      message: `Advance stage: ${selectedWorkbenchStage} (steps=${stageAdvancePlan.stepBudget})`,
    });
    if (selectedWorkbenchStage === VIDEOPLAY_WORKBENCH_STAGE.STORY_SOURCE && !pipelineCheckpoint) {
      void executePipeline({
        mode: 'run',
        stepBudget: stageAdvancePlan.stepBudget,
      });
      return;
    }
    void executePipeline({
      mode: 'continue',
      stepBudget: stageAdvancePlan.stepBudget,
    });
  }, [
    executePipeline,
    pipelineCheckpoint,
    selectedWorkbenchStage,
    setStatusBanner,
    stageAdvancePlan,
  ]);

  const handleConfirmRebuildPreview = useCallback(() => {
    setRebuildPreview((current) => (current ? { ...current, confirmed: true } : current));
    setStatusBanner?.({
      kind: 'info',
      message: 'Rebuild impact confirmed. Rerun step is now enabled.',
    });
  }, [setStatusBanner]);

  const handleRerunStep = useCallback(() => {
    if (rebuildPreview && !rebuildPreview.confirmed) {
      const blockedError: ControllerError = {
        reasonCode: VIDEOPLAY_REASON.STAGE_ADVANCE_REQUIRED,
        actionHint: 'Review and confirm rebuild impact before rerun.',
        message: 'Rebuild impact preview is not confirmed.',
      };
      setError(blockedError);
      setStatusBanner?.({
        kind: 'warn',
        message: `${blockedError.reasonCode}: ${blockedError.actionHint}`,
      });
      return;
    }
    const targetStep = rebuildPreview?.recommendedRerunStep || rerunStep;
    setStatusBanner?.({ kind: 'info', message: `Rerun step requested: ${targetStep}` });
    void executePipeline({
      mode: 'rerun-step',
      stepBudget: 1,
      rerunStepOverride: targetStep,
    });
  }, [executePipeline, rebuildPreview, rerunStep, setStatusBanner]);

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
    worldId,
    projectId,
    ingestCursorStart,
    stories,
    selectedStoryId,
    selectedStory,
    sourceMode,
    storyPackage,
    storyPackageLoading,
    storyPackageError,
    runStatus,
    stageProgress,
    workbenchStages,
    selectedWorkbenchStage,
    stageAdvancePlan,
    nextStep,
    rerunStep,
    rebuildPreview,
    operationType,
    operationPayload,
    selectedEpisodeId,
    routeStatuses,
    routeReady,
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
    onWorldIdChange: setWorldId,
    onProjectIdChange: setProjectId,
    onIngestCursorStartChange: setIngestCursorStart,
    onSelectStory: setSelectedStoryId,
    onSourceModeChange: setSourceMode,
    onSelectWorkbenchStage: setSelectedWorkbenchStage,
    onAdvanceStage: () => {
      handleAdvanceStage();
    },
    onRerunStepChange: setRerunStep,
    onOperationTypeChange: setOperationType,
    onOperationPayloadChange: setOperationPayload,
    onSelectEpisode: setSelectedEpisodeId,
    onRunPipeline: () => {
      handleRunPipeline();
    },
    onRerunStep: () => {
      handleRerunStep();
    },
    onContinueFromCheckpoint: () => {
      handleAdvanceStage();
    },
    onConfirmRebuildPreview: () => {
      handleConfirmRebuildPreview();
    },
    onCancelRun: () => {
      cancelRequestedRef.current = true;
      if (loading) {
        setRunStatus('CANCEL_REQUESTED');
      } else {
        setRunStatus('CANCELED');
      setPipelineCheckpoint(null);
      setNextStep(null);
      setStageProgress(createInitialStageProgress());
      setSelectedWorkbenchStage(VIDEOPLAY_WORKBENCH_STAGE.STORY_SOURCE);
    }
    },
    onApplyOperation: () => {
      void handleApplyOperation();
    },
    onPublish: () => {
      void handlePublish();
    },
    onReloadStoryPackage: () => {
      void loadSelectedStoryPackage();
    },
    onRefresh: () => {
      void refreshRouteStatuses();
      void refreshStoryCatalog();
      void refreshStorageView();
      void loadSelectedStoryPackage();
    },
  };
}

export function pipelineSteps(): readonly VideoPlayPipelineStep[] {
  return VIDEOPLAY_PIPELINE_CHAIN;
}
