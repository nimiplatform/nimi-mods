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
          synthesisJob={store.synthesisJob}
          onStart={actions.startSynthesis}
          onPause={actions.pauseSynthesis}
          onResume={actions.resumeSynthesis}
          onCancel={actions.cancelSynthesis}
        />
      );

    case 'play':
      return (
        <PlaybackStep
          chapters={store.project?.sourceChapters ?? []}
          segments={store.script?.segments ?? []}
          synthesisJob={store.synthesisJob}
          playbackState={ui.playbackState}
          onPlaySegment={actions.playSegmentAudio}
        />
      );

    default:
      return null;
  }
}
