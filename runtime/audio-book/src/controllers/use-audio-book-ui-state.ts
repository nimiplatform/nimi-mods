// ---------------------------------------------------------------------------
// Ephemeral UI state for Audio Book (React useState)
// ---------------------------------------------------------------------------

import { useState, useCallback } from 'react';
import type { SynthesisJob } from '../types.js';

export type AudioBookStep = 'import' | 'analyze' | 'cast' | 'synth' | 'play';

export type AnalysisProgress = {
  completedChapters: number;
  totalChapters: number;
  currentChapterIndex: number;
  segmentsSoFar: number;
  charactersSoFar: number;
};

export type PlaybackState = {
  playing: boolean;
  currentSegmentIndex: number;
  currentSegmentId?: string;
  currentTime: number;
  duration: number;
};

export type SynthProgress = {
  completed: number;
  total: number;
  failed: number;
  estimatedRemainingMs: number;
};

export function useAudioBookUiState() {
  const [currentStep, setCurrentStep] = useState<AudioBookStep>('import');
  const [importText, setImportText] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null);
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState<string | null>(null); // voiceId being previewed
  const [synthProgress, setSynthProgress] = useState<SynthProgress | null>(null);
  const [synthRunning, setSynthRunning] = useState(false);
  const [playbackState, setPlaybackState] = useState<PlaybackState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // Test synthesis mode (ephemeral — not persisted to IndexedDB)
  const [testMode, setTestMode] = useState(false);
  const [testSegmentIds, setTestSegmentIds] = useState<string[]>([]);
  const [testSynthesisJob, setTestSynthesisJob] = useState<SynthesisJob | null>(null);

  // Playback speed
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);

  // Playback chapter selection
  const [playbackChapter, setPlaybackChapter] = useState(0);

  const clearError = useCallback(() => setError(null), []);

  return {
    currentStep, setCurrentStep,
    importText, setImportText,
    importLoading, setImportLoading,
    analysisProgress, setAnalysisProgress,
    analysisRunning, setAnalysisRunning,
    selectedCharacter, setSelectedCharacter,
    previewPlaying, setPreviewPlaying,
    synthProgress, setSynthProgress,
    synthRunning, setSynthRunning,
    playbackState, setPlaybackState,
    error, setError, clearError,
    confirmDialog, setConfirmDialog,
    // Test mode
    testMode, setTestMode,
    testSegmentIds, setTestSegmentIds,
    testSynthesisJob, setTestSynthesisJob,
    // Playback
    playbackSpeed, setPlaybackSpeed,
    playbackChapter, setPlaybackChapter,
  };
}

export type AudioBookUiState = ReturnType<typeof useAudioBookUiState>;
