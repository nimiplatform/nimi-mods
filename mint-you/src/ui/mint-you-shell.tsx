import React from 'react';
import { useMintYouStore } from '../state/mint-you-store.js';
import { StepProgressBar } from './step-progress-bar.js';
import { StepBasicInfo } from './step-basic-info.js';
import { StepInterestTags } from './step-interest-tags.js';
import { StepInterview } from './step-interview.js';
import { StepProcessing } from './step-processing.js';
import { StepPreviewCard } from './step-preview-card.js';
import { StepConfirm } from './step-confirm.js';
import { StepResult } from './step-result.js';
import { MintYouRouteSidebar } from './mint-you-route-sidebar.js';
import { MintYouVisualStyles } from './mint-you-visual-styles.js';

function renderStep(step: string) {
  switch (step) {
    case 'basic-info':
      return <StepBasicInfo />;
    case 'interest-tags':
      return <StepInterestTags />;
    case 'interview':
      return <StepInterview />;
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
    <div className="ui-sync-root relative flex h-full min-h-0 overflow-hidden">
      <MintYouVisualStyles />
      <div className="ui-sync-pane ui-sync-pane-main flex min-h-0 min-w-0 flex-1 flex-col">
        <StepProgressBar currentStep={currentStep} />
        <div className="flex-1 overflow-y-auto">
          {renderStep(currentStep)}
        </div>
      </div>
      <MintYouRouteSidebar />
    </div>
  );
}
