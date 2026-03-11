import React from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import { useMintYouStore } from '../state/mint-you-store.js';
import { StepProgressBar } from './step-progress-bar.js';
import { StepBasicInfo } from './step-basic-info.js';
import { StepInterestTags } from './step-interest-tags.js';
import { StepInterview } from './step-interview.js';
import { StepProcessing } from './step-processing.js';
import { StepPreviewCard } from './step-preview-card.js';
import { StepConfirm } from './step-confirm.js';
import { StepResult } from './step-result.js';
import { MintYouSettingsDrawer } from './mint-you-settings-drawer.js';
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
  const { t } = useModTranslation('mint-you');
  const currentStep = useMintYouStore((s) => s.currentStep);
  const [settingsOpen, setSettingsOpen] = React.useState(false);

  return (
    <div className="ui-sync-root relative flex h-full min-h-0 overflow-hidden">
      <MintYouVisualStyles />
      <div className="ui-sync-pane ui-sync-pane-main flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="mx-4 mt-4 flex items-center gap-3">
          <StepProgressBar currentStep={currentStep} className="flex-1" />
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="ui-sync-btn ui-sync-btn-secondary inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border text-gray-700 shadow-[0_12px_24px_rgba(15,23,42,0.08)]"
            aria-label={t('SettingsDrawer.open')}
            title={t('SettingsDrawer.open')}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="18" x2="20" y2="18" />
              <circle cx="9" cy="6" r="2" fill="currentColor" stroke="none" />
              <circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" />
              <circle cx="11" cy="18" r="2" fill="currentColor" stroke="none" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {renderStep(currentStep)}
        </div>
      </div>
      <MintYouSettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
