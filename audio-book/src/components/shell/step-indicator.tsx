// ---------------------------------------------------------------------------
// Step indicator — 5-step navigation bar with progress
// ---------------------------------------------------------------------------

import React from 'react';
import type { AudioBookStep } from '../../controllers/use-audio-book-ui-state.js';

const STEP_LABELS: Record<AudioBookStep, string> = {
  import: 'Import',
  analyze: 'Analyze',
  cast: 'Cast',
  synth: 'Synthesize',
  play: 'Play',
};

type StepIndicatorProps = {
  steps: AudioBookStep[];
  currentStep: AudioBookStep;
  canEnterStep: (step: AudioBookStep) => boolean;
  onStepClick: (step: AudioBookStep) => void;
  currentIndex: number;
};

export function StepIndicator(props: StepIndicatorProps) {
  const { steps, currentStep, canEnterStep, onStepClick, currentIndex } = props;

  return (
    <nav className="flex items-center gap-1">
      {steps.map((step, i) => {
        const isCurrent = step === currentStep;
        const isCompleted = i < currentIndex && canEnterStep(step);
        const isClickable = canEnterStep(step);

        let bg = 'bg-gray-100 text-gray-400';
        if (isCurrent) bg = 'bg-blue-600 text-white';
        else if (isCompleted) bg = 'bg-blue-100 text-blue-700';
        else if (isClickable) bg = 'bg-gray-200 text-gray-700';

        return (
          <React.Fragment key={step}>
            {i > 0 && (
              <div className={`h-px w-4 ${i <= currentIndex ? 'bg-blue-300' : 'bg-gray-200'}`} />
            )}
            <button
              type="button"
              disabled={!isClickable}
              onClick={() => isClickable && onStepClick(step)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${bg} ${
                isClickable ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
              }`}
            >
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-current/10 text-[10px] font-bold">
                {isCompleted ? '\u2713' : i + 1}
              </span>
              {STEP_LABELS[step]}
            </button>
          </React.Fragment>
        );
      })}
    </nav>
  );
}
