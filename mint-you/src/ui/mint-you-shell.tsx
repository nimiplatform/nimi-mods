import React from 'react';
import { useMintYouStore } from '../state/mint-you-store.js';
import { StepProgressBar } from './step-progress-bar.js';
import { StepBasicInfo } from './step-basic-info.js';
import { StepInterestTags } from './step-interest-tags.js';
import { StepScenarios } from './step-scenarios.js';
import { StepProcessing } from './step-processing.js';
import { StepPreviewCard } from './step-preview-card.js';
import { StepConfirm } from './step-confirm.js';
import { StepResult } from './step-result.js';

function renderStep(step: string) {
  switch (step) {
    case 'basic-info':
      return <StepBasicInfo />;
    case 'interest-tags':
      return <StepInterestTags />;
    case 'scenarios':
      return <StepScenarios />;
    case 'trait-extract':
    case 'dna-synthesize':
      return <StepProcessing />;
    case 'preview-card':
      return <StepPreviewCard />;
    case 'user-confirm':
      return <StepConfirm />;
    case 'agent-create':
      return <StepResult />;
    default:
      return null;
  }
}

export function MintYouShell() {
  const currentStep = useMintYouStore((s) => s.currentStep);

  return (
    <div className="flex h-full flex-col">
      <StepProgressBar currentStep={currentStep} />
      <div className="flex-1 overflow-y-auto">
        {renderStep(currentStep)}
      </div>
    </div>
  );
}
