// ---------------------------------------------------------------------------
// Top-level page controller — orchestrates clients, store, UI state, navigation
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef } from 'react';
import { useVoiceStudioClients } from './use-voice-studio-clients.js';
import { useVoiceStudioUiState } from './use-voice-studio-ui-state.js';
import { useStepNavigation } from './use-step-navigation.js';
import { useVoiceStudioStore } from '../state/voice-studio-store.js';
import { splitTextIntoChapters } from '../services/chapter-splitter.js';
import { analyzeAllChapters } from '../services/analysis-pipeline.js';
import { classifyAllCharacters } from '../services/character-tier.js';
import { recommendAllVoices } from '../services/voice-recommender.js';
import { runSynthesisJob } from '../services/synthesis-scheduler.js';
import type { SynthesisJobController } from '../services/synthesis-scheduler.js';
import { dbPutAudio, dbGetAudio } from '../state/indexed-db.js';
import type { VoiceCasting } from '../types.js';

export function useVoiceStudioPageController() {
  const clients = useVoiceStudioClients();
  const ui = useVoiceStudioUiState();
  const store = useVoiceStudioStore();

  const synthControllerRef = useRef<SynthesisJobController | null>(null);
  const analysisAbortRef = useRef(false);

  // Load project list on mount
  useEffect(() => {
    store.loadProjectList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigation = useStepNavigation({
    currentStep: ui.currentStep,
    setCurrentStep: ui.setCurrentStep,
    projectState: store.project?.state ?? null,
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
      const result = await analyzeAllChapters(clients.llmClient, chapters, {
        onProgress: (p) => {
          if (analysisAbortRef.current) return;
          ui.setAnalysisProgress(p);
        },
      });

      if (analysisAbortRef.current) {
        store.updateProject({ state: 'imported' });
        return;
      }

      const classified = classifyAllCharacters(result.characters);

      store.updateProject({ state: 'analyzed' });
      store.setScript({
        projectId: store.project!.id,
        segments: result.segments,
        lastProcessedChapter: result.lastProcessedChapter,
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
  }, [store, clients.llmClient, ui]);

  const cancelAnalysis = useCallback(() => {
    analysisAbortRef.current = true;
    ui.setAnalysisRunning(false);
  }, [ui]);

  // ---------------------------------------------------------------------------
  // Actions: Cast
  // ---------------------------------------------------------------------------

  const startAutoCast = useCallback(async () => {
    if (store.characters.length === 0) return;

    ui.setError(null);
    store.updateProject({ state: 'casting' });

    try {
      const castings = await recommendAllVoices(
        clients.llmClient,
        clients.ttsClient,
        store.characters,
      );
      store.setVoiceCastings(castings);
      store.updateProject({ state: 'cast_complete' });
    } catch (err) {
      ui.setError(err instanceof Error ? err.message : 'Voice casting failed');
      store.updateProject({ state: 'analyzed' });
    }
  }, [store, clients.llmClient, clients.ttsClient, ui]);

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
      ui.setPreviewPlaying(casting.voiceId);
      try {
        const result = await clients.ttsClient.synthesize({
          text: '这是一段试听示例文本。This is a preview sample.',
          voiceId: casting.voiceId,
          providerId: casting.providerId,
          speakingRate: casting.speakingRate,
          pitch: casting.pitch,
          emotion: casting.emotion,
        });

        const url = URL.createObjectURL(result.audioBlob);
        const audio = new Audio(url);
        audio.onended = () => {
          URL.revokeObjectURL(url);
          ui.setPreviewPlaying(null);
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          ui.setPreviewPlaying(null);
        };
        await audio.play();
      } catch (err) {
        ui.setPreviewPlaying(null);
        ui.setError(err instanceof Error ? err.message : 'Preview failed');
      }
    },
    [clients.ttsClient, ui],
  );

  // ---------------------------------------------------------------------------
  // Actions: Synthesize
  // ---------------------------------------------------------------------------

  const startSynthesis = useCallback(async () => {
    const segments = store.script?.segments;
    if (!segments || segments.length === 0) return;
    if (store.voiceCastings.length === 0) return;

    ui.setSynthRunning(true);
    ui.setError(null);
    store.updateProject({ state: 'synthesizing' });

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
        onProgress: (p) => {
          ui.setSynthProgress({
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
      ui.setError(err instanceof Error ? err.message : 'Synthesis failed');
      store.updateProject({ state: 'cast_complete' });
    } finally {
      ui.setSynthRunning(false);
      ui.setSynthProgress(null);
      synthControllerRef.current = null;
    }
  }, [store, clients.ttsClient, ui]);

  const pauseSynthesis = useCallback(() => synthControllerRef.current?.pause(), []);
  const resumeSynthesis = useCallback(() => synthControllerRef.current?.resume(), []);
  const cancelSynthesis = useCallback(() => synthControllerRef.current?.cancel(), []);

  // ---------------------------------------------------------------------------
  // Actions: Playback
  // ---------------------------------------------------------------------------

  const playSegmentAudio = useCallback(
    async (segmentId: string) => {
      if (!store.project) return;
      const blob = await dbGetAudio(store.project.id, segmentId);
      if (!blob) {
        ui.setError('Audio not found for this segment');
        return;
      }

      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => {
        URL.revokeObjectURL(url);
        ui.setPlaybackState(null);
      };
      audio.ontimeupdate = () => {
        const segments = store.script?.segments ?? [];
        const idx = segments.findIndex((s) => s.id === segmentId);
        ui.setPlaybackState({
          playing: true,
          currentSegmentIndex: idx,
          currentTime: audio.currentTime * 1000,
          duration: (audio.duration || 0) * 1000,
        });
      };
      await audio.play();
    },
    [store, ui],
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
      playSegmentAudio,
    },
  };
}

export type VoiceStudioPageController = ReturnType<typeof useVoiceStudioPageController>;
