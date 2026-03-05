// ---------------------------------------------------------------------------
// Step content router — renders the active step component
// ---------------------------------------------------------------------------

import React from 'react';
import type { AudioBookPageController } from '../controllers/audio-book-page-controller.js';
import { ImportStep } from './import/import-step.js';
import { AnalyzeStep } from './analyze/analyze-step.js';
import { CastStep } from './cast/cast-step.js';
import { SynthesisStep } from './synth/synthesis-step.js';
import { PlaybackStep } from './playback/playback-step.js';

type StepContentProps = {
  controller: AudioBookPageController;
};

export function StepContent({ controller }: StepContentProps) {
  const { store, ui, actions, clients, navigation } = controller;

  switch (navigation.currentStep) {
    case 'import':
      return (
        <ImportStep
          importText={ui.importText}
          importLoading={ui.importLoading}
          projectName={store.project?.name ?? ''}
          onImport={actions.importText}
          onNameChange={actions.updateProjectName}
        />
      );

    case 'analyze':
      return (
        <AnalyzeStep
          chapters={store.project?.sourceChapters ?? []}
          analysisRunning={ui.analysisRunning}
          progress={ui.analysisProgress}
          characters={store.characters}
          segments={store.script?.segments ?? []}
          ttsRoute={controller.ttsRoute}
          onStart={actions.startAnalysis}
          onCancel={actions.cancelAnalysis}
        />
      );

    case 'cast':
      return (
        <CastStep
          characters={store.characters}
          castings={store.voiceCastings}
          selectedCharacter={ui.selectedCharacter}
          previewPlaying={ui.previewPlaying}
          ttsClient={clients.ttsClient}
          ttsRoute={controller.ttsRoute}
          onSelectCharacter={ui.setSelectedCharacter}
          onUpdateCasting={actions.updateCasting}
          onPreviewVoice={actions.previewVoice}
          onAutoRecommend={actions.startAutoCast}
        />
      );

    case 'synth':
      return (
        <SynthesisStep
          synthRunning={ui.synthRunning}
          progress={ui.synthProgress}
          synthesisJob={ui.testMode ? (ui.testSynthesisJob ?? null) : (store.synthesisJob ?? null)}
          segments={store.script?.segments ?? []}
          testMode={ui.testMode}
          testSegmentIds={ui.testSegmentIds}
          onStart={actions.startSynthesis}
          onStartTest={actions.startTestSynthesis}
          onPause={actions.pauseSynthesis}
          onResume={actions.resumeSynthesis}
          onCancel={actions.cancelSynthesis}
          onPlaySegment={actions.playSegmentAudio}
          onGoToPlayer={() => ui.setCurrentStep('play')}
        />
      );

    case 'play':
      return (
        <PlaybackStep
          chapters={store.project?.sourceChapters ?? []}
          segments={store.script?.segments ?? []}
          synthesisJob={ui.testSynthesisJob ?? store.synthesisJob ?? null}
          playbackState={ui.playbackState}
          playbackSpeed={ui.playbackSpeed}
          playbackChapter={ui.playbackChapter}
          synthRunning={ui.synthRunning}
          onPlaySegment={actions.playSegmentAudio}
          onStopPlayback={actions.stopPlayback}
          onRetryFailed={actions.retryFailedSynthesis}
          onSetSpeed={ui.setPlaybackSpeed}
          onSetChapter={ui.setPlaybackChapter}
        />
      );

    default:
      return null;
  }
}
