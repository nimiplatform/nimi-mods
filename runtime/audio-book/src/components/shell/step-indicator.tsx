// ---------------------------------------------------------------------------
// Step indicator — clean pill-style navigation with separator lines
// ---------------------------------------------------------------------------

import React from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import type { AudioBookStep } from '../../controllers/use-audio-book-ui-state.js';

const STEP_LABEL_KEYS: Record<AudioBookStep, string> = {
  import: 'stepLabels.import',
  analyze: 'stepLabels.analyze',
  cast: 'stepLabels.cast',
  synth: 'stepLabels.synth',
  play: 'stepLabels.play',
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
  const { t } = useModTranslation('audio-book');

  return (
    <nav className="flex items-center gap-1">
      {steps.map((step, i) => {
        const isCurrent = step === currentStep;
        const isClickable = canEnterStep(step);
        const label = t(STEP_LABEL_KEYS[step]);

        let pillClass = 'text-gray-400';
        if (isCurrent) pillClass = 'bg-indigo-50 text-indigo-600 font-semibold';
        else if (isClickable) pillClass = 'text-gray-500 hover:text-gray-700';

        return (
          <React.Fragment key={step}>
            {i > 0 && (
              <div className="mx-0.5 h-px w-4 bg-gray-200" />
            )}
            <button
              type="button"
              disabled={!isClickable}
              onClick={() => isClickable && onStepClick(step)}
              className={`rounded-full px-3 py-1.5 text-xs transition-colors ${pillClass} ${
                isClickable ? 'cursor-pointer' : 'cursor-default'
              }`}
            >
              {label}
            </button>
          </React.Fragment>
        );
      })}
    </nav>
  );
}
