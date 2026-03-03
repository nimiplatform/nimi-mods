// ---------------------------------------------------------------------------
// Ephemeral UI state for Audio Book (React useState)
// ---------------------------------------------------------------------------

import { useState, useCallback } from 'react';

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
  };
}

export type AudioBookUiState = ReturnType<typeof useAudioBookUiState>;
