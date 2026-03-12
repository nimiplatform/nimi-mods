// ---------------------------------------------------------------------------
// Project header — logo + step indicator (matches Pencil design)
// ---------------------------------------------------------------------------

import React from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import { StepIndicator } from '../shell/step-indicator.js';
import type { AudioBookStep } from '../../controllers/use-audio-book-ui-state.js';

type ProjectHeaderProps = {
  projectName: string;
  onBack: () => void;
  steps: AudioBookStep[];
  currentStep: AudioBookStep;
  currentIndex: number;
  canEnterStep: (step: AudioBookStep) => boolean;
  onStepClick: (step: AudioBookStep) => void;
};

export function ProjectHeader(props: ProjectHeaderProps) {
  const { t } = useModTranslation('audio-book');

  return (
    <div className="flex w-full items-center justify-between">
      {/* Logo + Back */}
      <button
        type="button"
        onClick={props.onBack}
        className="flex items-center gap-2 rounded-lg px-1 py-1 text-gray-700 transition-colors hover:bg-gray-50"
        title={t('projectHeader.backToProjects')}
      >
        <svg className="h-5 w-5 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
        <span className="text-sm font-semibold text-gray-900">{t('projectHeader.studioTitle')}</span>
      </button>

      {/* Step indicator */}
      <StepIndicator
        steps={props.steps}
        currentStep={props.currentStep}
        currentIndex={props.currentIndex}
        canEnterStep={props.canEnterStep}
        onStepClick={props.onStepClick}
      />
    </div>
  );
}
