import React from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import type { MintYouPipelineStep } from '../contracts.js';

const VISIBLE_STEPS: { key: MintYouPipelineStep; labelKey: string }[] = [
  { key: 'basic-info', labelKey: 'Steps.basicInfo' },
  { key: 'interest-tags', labelKey: 'Steps.interestTags' },
  { key: 'scenarios', labelKey: 'Steps.scenarios' },
  { key: 'trait-extract', labelKey: 'Steps.processing' },
  { key: 'preview-card', labelKey: 'Steps.preview' },
  { key: 'user-confirm', labelKey: 'Steps.confirm' },
  { key: 'agent-create', labelKey: 'Steps.result' },
];

const STEP_ORDER: MintYouPipelineStep[] = [
  'basic-info',
  'interest-tags',
  'scenarios',
  'trait-extract',
  'dna-synthesize',
  'preview-card',
  'user-confirm',
  'agent-create',
];

function getStepIndex(step: MintYouPipelineStep): number {
  return STEP_ORDER.indexOf(step);
}

function getVisibleIndex(step: MintYouPipelineStep): number {
  // dna-synthesize maps to same visual position as trait-extract
  const mapped = step === 'dna-synthesize' ? 'trait-extract' : step;
  return VISIBLE_STEPS.findIndex(s => s.key === mapped);
}

type StepProgressBarProps = {
  currentStep: MintYouPipelineStep;
};

export function StepProgressBar({ currentStep }: StepProgressBarProps) {
  const { t } = useModTranslation('mint-you');
  const currentVisibleIdx = getVisibleIndex(currentStep);

  return (
    <div className="flex items-center gap-1 px-4 py-3">
      {VISIBLE_STEPS.map((step, idx) => {
        const isCompleted = idx < currentVisibleIdx;
        const isCurrent = idx === currentVisibleIdx;

        return (
          <React.Fragment key={step.key}>
            {idx > 0 && (
              <div
                className={`h-px flex-1 ${isCompleted ? 'bg-[#4ECCA3]' : 'bg-gray-200'}`}
              />
            )}
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                  isCompleted
                    ? 'bg-[#4ECCA3] text-white'
                    : isCurrent
                      ? 'border-2 border-[#4ECCA3] text-[#4ECCA3]'
                      : 'border border-gray-300 text-gray-400'
                }`}
              >
                {isCompleted ? '\u2713' : idx + 1}
              </div>
              <span
                className={`text-[10px] whitespace-nowrap ${
                  isCurrent ? 'font-medium text-[#4ECCA3]' : 'text-gray-400'
                }`}
              >
                {t(step.labelKey)}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
