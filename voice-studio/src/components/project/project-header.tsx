// ---------------------------------------------------------------------------
// Project header — project name + back button + step indicator
// ---------------------------------------------------------------------------

import React from 'react';
import { StepIndicator } from '../shell/step-indicator.js';
import type { VoiceStudioStep } from '../../controllers/use-voice-studio-ui-state.js';

type ProjectHeaderProps = {
  projectName: string;
  onBack: () => void;
  steps: VoiceStudioStep[];
  currentStep: VoiceStudioStep;
  currentIndex: number;
  canEnterStep: (step: VoiceStudioStep) => boolean;
  onStepClick: (step: VoiceStudioStep) => void;
};

export function ProjectHeader(props: ProjectHeaderProps) {
  return (
    <div className="flex w-full items-center gap-3">
      <button
        type="button"
        onClick={props.onBack}
        className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        title="Back to projects"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
        </svg>
      </button>
      <span className="truncate text-sm font-semibold text-gray-900">{props.projectName}</span>
      <div className="ml-auto">
        <StepIndicator
          steps={props.steps}
          currentStep={props.currentStep}
          currentIndex={props.currentIndex}
          canEnterStep={props.canEnterStep}
          onStepClick={props.onStepClick}
        />
      </div>
    </div>
  );
}
