// ---------------------------------------------------------------------------
// Top-level page controller — orchestrates clients, store, UI state, navigation
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef } from 'react';
import { useHookClient, useAiClient, useAudioBookClients } from './use-audio-book-clients.js';
import { useAudioBookUiState } from './use-audio-book-ui-state.js';
import { useStepNavigation } from './use-step-navigation.js';
import { useTtsRoute } from './use-tts-route.js';
import { useAudioBookStore } from '../state/audio-book-store.js';
import { splitTextIntoChapters } from '../services/chapter-splitter.js';
import { analyzeAllChapters } from '../services/analysis-pipeline.js';
import type { AnalysisResult } from '../services/analysis-pipeline.js';
import { classifyAllCharacters } from '../services/character-tier.js';
import { recommendAllVoices } from '../services/voice-recommender.js';
import { runSynthesisJob } from '../services/synthesis-scheduler.js';
import type { SynthesisJobController } from '../services/synthesis-scheduler.js';
import { dbPutAudio, dbGetAudio } from '../state/indexed-db.js';
import type { SegmentJob, VoiceCasting } from '../types.js';
import { createLlmClientAdapter } from '../adapters/llm-adapter.js';

const FLOW_LOG_PREFIX = '[audio-book:flow]';

type AnalysisQuality = {
  totalSegments: number;
  fallbackSegments: number;
  errorChapters: number;
  nonNarratorCharacters: number;
};

function measureAnalysisQuality(result: AnalysisResult): AnalysisQuality {
  const totalSegments = result.segments.length;
  const fallbackSegments = result.segments.filter((segment) => segment.id.includes('-fallback-')).length;
  const errorChapters = result.chapterResults.filter((item) => Boolean(item.error)).length;
  const nonNarratorCharacters = result.characters.filter((item) => item.name !== 'narrator').length;
  return { totalSegments, fallbackSegments, errorChapters, nonNarratorCharacters };
}

function isBetterAnalysisQuality(candidate: AnalysisQuality, baseline: AnalysisQuality): boolean {
  if (candidate.fallbackSegments !== baseline.fallbackSegments) {
    return candidate.fallbackSegments < baseline.fallbackSegments;
  }
  if (candidate.errorChapters !== baseline.errorChapters) {
    return candidate.errorChapters < baseline.errorChapters;
  }
  if (candidate.nonNarratorCharacters !== baseline.nonNarratorCharacters) {
    return candidate.nonNarratorCharacters > baseline.nonNarratorCharacters;
  }
  if (candidate.totalSegments !== baseline.totalSegments) {
    return candidate.totalSegments > baseline.totalSegments;
  }
  return false;
}

export function useAudioBookPageController() {
  // 1. Stable singletons
  const hookClient = useHookClient();
  const aiClient = useAiClient();
  // 2. Route state (loads connectors for chat + TTS with retry + resolveRoute fallback)
  const ttsRoute = useTtsRoute(hookClient, aiClient);
  // 3. AI clients — llmClient rebuilds when chat connector changes
  const clients = useAudioBookClients(hookClient, aiClient, ttsRoute.chatSelection);
  const ui = useAudioBookUiState();
  const store = useAudioBookStore();

  const synthControllerRef = useRef<SynthesisJobController | null>(null);
  const analysisAbortRef = useRef(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewAudioUrlRef = useRef<string | null>(null);
  const playbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const playbackAudioUrlRef = useRef<string | null>(null);

  const stopPreviewAudio = useCallback(() => {
    const audio = previewAudioRef.current;
    if (audio) {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch { /* ignore */ }
    }
    if (previewAudioUrlRef.current) {
      URL.revokeObjectURL(previewAudioUrlRef.current);
    }
    previewAudioRef.current = null;
    previewAudioUrlRef.current = null;
    ui.setPreviewPlaying(null);
  }, [ui]);

  const stopPlaybackAudio = useCallback(() => {
    const audio = playbackAudioRef.current;
    if (audio) {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch { /* ignore */ }
    }
    if (playbackAudioUrlRef.current) {
      URL.revokeObjectURL(playbackAudioUrlRef.current);
    }
    playbackAudioRef.current = null;
    playbackAudioUrlRef.current = null;
    ui.setPlaybackState(null);
  }, [ui]);

  useEffect(() => {
    console.info(FLOW_LOG_PREFIX, 'controller:mounted');
    return () => {
      stopPreviewAudio();
      stopPlaybackAudio();
      console.info(FLOW_LOG_PREFIX, 'controller:unmounted');
    };
  }, [stopPlaybackAudio, stopPreviewAudio]);

  useEffect(() => {
    console.info(FLOW_LOG_PREFIX, 'route:snapshot', {
      loading: ttsRoute.loading,
      error: ttsRoute.error || '(none)',
      chatConnectorId: ttsRoute.chatSelection.connectorId || '(none)',
      chatModel: ttsRoute.chatSelection.model || '(none)',
      connectorsCount: ttsRoute.ttsConnectors.length,
      connectorId: ttsRoute.ttsSelection.connectorId || '(none)',
      routeSource: ttsRoute.ttsSelection.routeSource,
      model: ttsRoute.ttsSelection.model || '(none)',
    });
  }, [
    ttsRoute.error,
    ttsRoute.loading,
    ttsRoute.chatSelection.connectorId,
    ttsRoute.chatSelection.model,
    ttsRoute.ttsConnectors.length,
    ttsRoute.ttsSelection.connectorId,
    ttsRoute.ttsSelection.model,
    ttsRoute.ttsSelection.routeSource,
  ]);

  useEffect(() => {
    console.info(FLOW_LOG_PREFIX, 'step:changed', {
      step: ui.currentStep,
      projectState: store.project?.state || '(none)',
      segmentsCount: store.script?.segments.length || 0,
      castingsCount: store.voiceCastings.length,
      synthRunning: ui.synthRunning,
    });
  }, [
    store.project?.state,
    store.script?.segments.length,
    store.voiceCastings.length,
    ui.currentStep,
    ui.synthRunning,
  ]);

  // Load project list on mount
  useEffect(() => {
    store.loadProjectList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigation = useStepNavigation({
    currentStep: ui.currentStep,
    setCurrentStep: ui.setCurrentStep,
    projectState: store.project?.state ?? null,
    segmentsCount: store.script?.segments.length || 0,
    castingsCount: store.voiceCastings.length,
    onConfirmBacktrack: (target, callback) => {
      ui.setConfirmDialog({
        message: `Going back to "${target}" may discard downstream progress. Continue?`,
        onConfirm: () => {
          ui.setConfirmDialog(null);
          callback();
        },
      });
    },
  });

  // Auto-persist active project on changes
  useEffect(() => {
    if (store.project) {
      store.persistActiveProject();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.project]);

  // ---------------------------------------------------------------------------
  // Actions: Import
  // ---------------------------------------------------------------------------

  const importText = useCallback(
    async (text: string, projectName: string): Promise<void> => {
      ui.setImportLoading(true);
      ui.setError(null);
      try {
        const chapters = splitTextIntoChapters(text);
        if (chapters.length === 0) {
          ui.setError('No chapters detected in the imported text.');
          return;
        }

        // Create or update project
        let project = store.project;
        if (!project) {
          project = await store.createProject(projectName || 'Untitled');
        }

        store.updateProject({
          state: 'imported',
          sourceChapters: chapters,
        });

        ui.setImportText(text);
        ui.setCurrentStep('analyze');
      } catch (err) {
        ui.setError(err instanceof Error ? err.message : 'Import failed');
      } finally {
        ui.setImportLoading(false);
      }
    },
    [store, ui],
  );

  // ---------------------------------------------------------------------------
  // Actions: Analyze
  // ---------------------------------------------------------------------------

  const startAnalysis = useCallback(async () => {
    const chapters = store.project?.sourceChapters;
    if (!chapters || chapters.length === 0) return;

    ui.setAnalysisRunning(true);
    ui.setError(null);
    analysisAbortRef.current = false;
    store.updateProject({ state: 'analyzing' });

    try {
      const runAnalysis = async (
        llmClient: typeof clients.llmClient,
        route: 'selected-chat-route' | 'default-chat-route',
      ): Promise<{ result: AnalysisResult; quality: AnalysisQuality }> => {
        console.info(FLOW_LOG_PREFIX, 'analyze:run', { route });
        const result = await analyzeAllChapters(llmClient, chapters, {
          onProgress: (p) => {
            if (analysisAbortRef.current) return;
            ui.setAnalysisProgress(p);
          },
        });
        const quality = measureAnalysisQuality(result);
        console.info(FLOW_LOG_PREFIX, 'analyze:result', {
          route,
          ...quality,
        });
        return { result, quality };
      };

      const primary = await runAnalysis(clients.llmClient, 'selected-chat-route');

      if (analysisAbortRef.current) {
        store.updateProject({ state: 'imported' });
        return;
      }

      let chosen = primary;
      const shouldRetryWithDefaultRoute = primary.quality.errorChapters > 0
        || primary.quality.fallbackSegments === primary.quality.totalSegments;
      if (shouldRetryWithDefaultRoute) {
        const fallbackLlmClient = createLlmClientAdapter(aiClient);
        const secondary = await runAnalysis(fallbackLlmClient, 'default-chat-route');
        if (isBetterAnalysisQuality(secondary.quality, primary.quality)) {
          chosen = secondary;
          console.info(FLOW_LOG_PREFIX, 'analyze:choose', {
            selectedRoute: 'default-chat-route',
            replaced: 'selected-chat-route',
          });
        } else {
          console.info(FLOW_LOG_PREFIX, 'analyze:choose', {
            selectedRoute: 'selected-chat-route',
            keptOver: 'default-chat-route',
          });
        }
      }

      if (chosen.result.segments.length === 0) {
        throw new Error('Analyze produced zero segments. Please retry analysis.');
      }
      if (chosen.quality.fallbackSegments === chosen.quality.totalSegments) {
        throw new Error('Analysis degraded to fallback segments only. Please switch Analyze LLM provider and retry.');
      }

      const classified = classifyAllCharacters(chosen.result.characters);

      store.updateProject({ state: 'analyzed' });
      store.setScript({
        projectId: store.project!.id,
        segments: chosen.result.segments,
        lastProcessedChapter: chosen.result.lastProcessedChapter,
      });
      store.setCharacters(classified);

      ui.setCurrentStep('cast');
    } catch (err) {
      if (!analysisAbortRef.current) {
        ui.setError(err instanceof Error ? err.message : 'Analysis failed');
        store.updateProject({ state: 'imported' });
      }
    } finally {
      ui.setAnalysisRunning(false);
      ui.setAnalysisProgress(null);
    }
  }, [store, clients.llmClient, ui, aiClient]);

  const cancelAnalysis = useCallback(() => {
    analysisAbortRef.current = true;
    ui.setAnalysisRunning(false);
  }, [ui]);

  // ---------------------------------------------------------------------------
  // Actions: Cast
  // ---------------------------------------------------------------------------

  const startAutoCast = useCallback(async () => {
    if (store.characters.length === 0) return;
    if ((store.script?.segments.length || 0) === 0) {
      console.warn(FLOW_LOG_PREFIX, 'cast:auto:blocked', {
        reason: 'segments-empty',
      });
      ui.setError('No analyzed script segments found. Please run Analyze first.');
      return;
    }

    ui.setError(null);
    store.updateProject({ state: 'casting' });
    console.info(FLOW_LOG_PREFIX, 'cast:auto:start', {
      charactersCount: store.characters.length,
      connectorId: ttsRoute.ttsSelection.connectorId || '(none)',
      routeSource: ttsRoute.ttsSelection.routeSource,
      model: ttsRoute.ttsSelection.model || '(none)',
    });

    try {
      const castings = await recommendAllVoices(
        clients.llmClient,
        clients.ttsClient,
        store.characters,
        {
          connectorId: ttsRoute.ttsSelection.connectorId || undefined,
          routeSource: ttsRoute.ttsSelection.routeSource,
          model: ttsRoute.ttsSelection.model,
        },
      );
      store.setVoiceCastings(castings);
      store.updateProject({ state: 'cast_complete' });
      console.info(FLOW_LOG_PREFIX, 'cast:auto:ok', {
        castingsCount: castings.length,
      });
    } catch (err) {
      console.warn(FLOW_LOG_PREFIX, 'cast:auto:failed', {
        error: err instanceof Error ? err.message : String(err),
        connectorId: ttsRoute.ttsSelection.connectorId || '(none)',
        routeSource: ttsRoute.ttsSelection.routeSource,
        model: ttsRoute.ttsSelection.model || '(none)',
      });
      ui.setError(err instanceof Error ? err.message : 'Voice casting failed');
      store.updateProject({ state: 'analyzed' });
    }
  }, [
    store,
    clients.llmClient,
    clients.ttsClient,
    ui,
    ttsRoute.ttsSelection.connectorId,
    ttsRoute.ttsSelection.model,
    ttsRoute.ttsSelection.routeSource,
  ]);

  const updateCasting = useCallback(
    (characterName: string, patch: Partial<VoiceCasting>) => {
      const castings = store.voiceCastings.map((c) =>
        c.characterName === characterName ? { ...c, ...patch } : c,
      );
      store.setVoiceCastings(castings);
    },
    [store],
  );

  const previewVoice = useCallback(
    async (casting: VoiceCasting) => {
      stopPreviewAudio();
      stopPlaybackAudio();
      ui.setPreviewPlaying(casting.voiceId);
      console.info(FLOW_LOG_PREFIX, 'cast:preview:start', {
        characterName: casting.characterName,
        voiceId: casting.voiceId,
        providerId: casting.providerId,
        connectorId: ttsRoute.ttsSelection.connectorId || '(none)',
        routeSource: ttsRoute.ttsSelection.routeSource,
        model: ttsRoute.ttsSelection.model || '(none)',
      });
      try {
        const result = await clients.ttsClient.synthesize({
          text: '这是一段试听示例文本。This is a preview sample.',
          voiceId: casting.voiceId,
          providerId: casting.providerId,
          speakingRate: casting.speakingRate,
          pitch: casting.pitch,
          emotion: casting.emotion,
          connectorId: ttsRoute.ttsSelection.connectorId || undefined,
          routeSource: ttsRoute.ttsSelection.routeSource,
          model: ttsRoute.ttsSelection.model,
        });
        console.info(FLOW_LOG_PREFIX, 'cast:preview:ok', {
          characterName: casting.characterName,
          voiceId: casting.voiceId,
          durationMs: result.durationMs,
        });

        const url = URL.createObjectURL(result.audioBlob);
        const audio = new Audio(url);
        previewAudioRef.current = audio;
        previewAudioUrlRef.current = url;
        audio.onended = () => {
          if (previewAudioRef.current === audio) {
            stopPreviewAudio();
          }
        };
        audio.onerror = () => {
          if (previewAudioRef.current === audio) {
            stopPreviewAudio();
          }
        };
        await audio.play();
      } catch (err) {
        console.warn(FLOW_LOG_PREFIX, 'cast:preview:failed', {
          characterName: casting.characterName,
          voiceId: casting.voiceId,
          error: err instanceof Error ? err.message : String(err),
          connectorId: ttsRoute.ttsSelection.connectorId || '(none)',
          routeSource: ttsRoute.ttsSelection.routeSource,
          model: ttsRoute.ttsSelection.model || '(none)',
        });
        stopPreviewAudio();
        ui.setError(err instanceof Error ? err.message : 'Preview failed');
      }
    },
    [
      clients.ttsClient,
      stopPlaybackAudio,
      stopPreviewAudio,
      ui,
      ttsRoute.ttsSelection.connectorId,
      ttsRoute.ttsSelection.model,
      ttsRoute.ttsSelection.routeSource,
    ],
  );

  // ---------------------------------------------------------------------------
  // Actions: Synthesize
  // ---------------------------------------------------------------------------

  const runSynthesis = useCallback(async (existingJobs?: SegmentJob[], reason: 'start' | 'retry-failed' = 'start') => {
    const segments = store.script?.segments ?? [];
    const castingsCount = store.voiceCastings.length;

    if (ui.synthRunning) {
      console.info(FLOW_LOG_PREFIX, 'synth:blocked', {
        reason: 'already-running',
      });
      return;
    }
    if (segments.length === 0) {
      console.warn(FLOW_LOG_PREFIX, 'synth:blocked', {
        reason: 'segments-empty',
        projectId: store.project?.id || '(none)',
      });
      ui.setError('No analyzed script segments found. Please run Analyze first.');
      return;
    }
    const fallbackSegments = segments.filter((segment) => segment.id.includes('-fallback-')).length;
    if (fallbackSegments === segments.length) {
      console.warn(FLOW_LOG_PREFIX, 'synth:blocked', {
        reason: 'segments-fallback-only',
        projectId: store.project?.id || '(none)',
        segmentsCount: segments.length,
      });
      ui.setError('Analysis quality is too low (fallback-only segments). Please re-run Analyze before synthesis.');
      return;
    }
    if (castingsCount === 0) {
      console.warn(FLOW_LOG_PREFIX, 'synth:blocked', {
        reason: 'castings-empty',
        projectId: store.project?.id || '(none)',
      });
      ui.setError('No voice castings found. Please complete voice casting first.');
      return;
    }

    ui.setSynthRunning(true);
    ui.setError(null);
    store.updateProject({ state: 'synthesizing' });
    console.info(FLOW_LOG_PREFIX, 'synth:start', {
      reason,
      projectId: store.project?.id || '(none)',
      segmentsCount: segments.length,
      castingsCount,
      connectorId: ttsRoute.ttsSelection.connectorId || '(none)',
      routeSource: ttsRoute.ttsSelection.routeSource,
      model: ttsRoute.ttsSelection.model || '(none)',
    });

    const castingMap = new Map<string, VoiceCasting>();
    for (const c of store.voiceCastings) {
      castingMap.set(c.characterName, c);
    }

    const { promise, controller } = runSynthesisJob(
      clients.ttsClient,
      segments,
      castingMap,
      store.project!.id,
      {
        maxConcurrency: 3,
        ttsRoute: {
          connectorId: ttsRoute.ttsSelection.connectorId || undefined,
          routeSource: ttsRoute.ttsSelection.routeSource,
          model: ttsRoute.ttsSelection.model,
        },
        existingJobs,
        onProgress: (p) => {
          ui.setSynthProgress({
            completed: p.completed,
            total: p.total,
            failed: p.failed,
            estimatedRemainingMs: p.estimatedRemainingMs,
          });
          console.info(FLOW_LOG_PREFIX, 'synth:progress', {
            completed: p.completed,
            total: p.total,
            failed: p.failed,
            estimatedRemainingMs: p.estimatedRemainingMs,
          });
        },
        onAudioReady: async (segmentId, blob, _durationMs) => {
          await dbPutAudio(store.project!.id, segmentId, blob);
        },
      },
    );

    synthControllerRef.current = controller;

    try {
      const job = await promise;
      store.setSynthesisJob(job);
      console.info(FLOW_LOG_PREFIX, 'synth:done', {
        status: job.status,
        total: job.segmentJobs.length,
        completed: job.segmentJobs.filter((item) => item.status === 'done').length,
        failed: job.segmentJobs.filter((item) => item.status === 'failed').length,
      });
      if (job.status === 'done_with_errors') {
        const failedJobs = job.segmentJobs.filter((item) => item.status === 'failed');
        for (const failed of failedJobs) {
          const segment = segments.find((item) => item.id === failed.segmentId);
          const casting = segment ? castingMap.get(segment.speaker) : undefined;
          console.warn(FLOW_LOG_PREFIX, 'synth:segment-failed', {
            segmentId: failed.segmentId,
            speaker: segment?.speaker || '(unknown)',
            textLength: segment?.text.length || 0,
            previewText: segment?.text ? segment.text.slice(0, 80) : '',
            voiceId: casting?.voiceId || '(none)',
            providerId: casting?.providerId || '(none)',
            error: failed.error || '(none)',
            errorClassification: failed.errorClassification || '(none)',
            retryCount: failed.retryCount,
          });
        }
      }

      if (job.status === 'done') {
        store.updateProject({ state: 'done' });
        ui.setCurrentStep('play');
      } else if (job.status === 'done_with_errors') {
        store.updateProject({ state: 'done_with_errors' });
        ui.setCurrentStep('play');
      } else if (job.status === 'cancelled') {
        store.updateProject({ state: 'cancelled' });
      }
    } catch (err) {
      console.warn(FLOW_LOG_PREFIX, 'synth:failed', {
        error: err instanceof Error ? err.message : String(err),
        connectorId: ttsRoute.ttsSelection.connectorId || '(none)',
        routeSource: ttsRoute.ttsSelection.routeSource,
        model: ttsRoute.ttsSelection.model || '(none)',
      });
      ui.setError(err instanceof Error ? err.message : 'Synthesis failed');
      store.updateProject({ state: 'cast_complete' });
    } finally {
      ui.setSynthRunning(false);
      ui.setSynthProgress(null);
      synthControllerRef.current = null;
    }
  }, [
    store,
    clients.ttsClient,
    ui,
    ttsRoute.ttsSelection.connectorId,
    ttsRoute.ttsSelection.model,
    ttsRoute.ttsSelection.routeSource,
  ]);

  const startSynthesis = useCallback(async () => {
    await runSynthesis(undefined, 'start');
  }, [runSynthesis]);

  const retryFailedSynthesis = useCallback(async () => {
    const failed = store.synthesisJob?.segmentJobs.filter((item) => item.status === 'failed') ?? [];
    if (failed.length === 0) {
      console.info(FLOW_LOG_PREFIX, 'synth:retry:blocked', { reason: 'no-failed-segments' });
      return;
    }
    console.info(FLOW_LOG_PREFIX, 'synth:retry:start', { failedCount: failed.length });
    await runSynthesis(store.synthesisJob?.segmentJobs ?? [], 'retry-failed');
  }, [runSynthesis, store.synthesisJob?.segmentJobs]);

  const pauseSynthesis = useCallback(() => synthControllerRef.current?.pause(), []);
  const resumeSynthesis = useCallback(() => synthControllerRef.current?.resume(), []);
  const cancelSynthesis = useCallback(() => synthControllerRef.current?.cancel(), []);

  // ---------------------------------------------------------------------------
  // Actions: Playback
  // ---------------------------------------------------------------------------

  const playSegmentAudio = useCallback(
    async (segmentId: string) => {
      if (!store.project) return;
      stopPreviewAudio();
      stopPlaybackAudio();
      const blob = await dbGetAudio(store.project.id, segmentId);
      if (!blob) {
        ui.setError('Audio not found for this segment');
        return;
      }

      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      playbackAudioRef.current = audio;
      playbackAudioUrlRef.current = url;
      audio.onended = () => {
        if (playbackAudioRef.current === audio) {
          stopPlaybackAudio();
        }
      };
      audio.onerror = () => {
        if (playbackAudioRef.current === audio) {
          stopPlaybackAudio();
        }
      };
      audio.ontimeupdate = () => {
        if (playbackAudioRef.current !== audio) return;
        const segments = store.script?.segments ?? [];
        const idx = segments.findIndex((s) => s.id === segmentId);
        ui.setPlaybackState({
          playing: true,
          currentSegmentIndex: idx,
          currentSegmentId: segmentId,
          currentTime: audio.currentTime * 1000,
          duration: (audio.duration || 0) * 1000,
        });
      };
      await audio.play();
    },
    [store, stopPlaybackAudio, stopPreviewAudio, ui],
  );

  // ---------------------------------------------------------------------------
  // Composed return
  // ---------------------------------------------------------------------------

  return {
    // Clients
    clients,
    // Store
    store,
    // UI state
    ui,
    // Navigation
    navigation,
    // TTS routing
    ttsRoute,
    // Actions
    actions: {
      importText,
      startAnalysis,
      cancelAnalysis,
      startAutoCast,
      updateCasting,
      previewVoice,
      startSynthesis,
      pauseSynthesis,
      resumeSynthesis,
      cancelSynthesis,
      retryFailedSynthesis,
      playSegmentAudio,
    },
  };
}

export type AudioBookPageController = ReturnType<typeof useAudioBookPageController>;
