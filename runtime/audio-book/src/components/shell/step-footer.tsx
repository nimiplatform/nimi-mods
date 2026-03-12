// ---------------------------------------------------------------------------
// Step footer — prev/next navigation with arrow icons (matches Pencil design)
// ---------------------------------------------------------------------------
import React from 'react';
import type { AudioBookStep } from '../../controllers/use-audio-book-ui-state.js';
import { useModTranslation } from "@nimiplatform/sdk/mod";
const STEP_LABEL_KEYS: Record<AudioBookStep, string> = {
    import: 'stepLabels.import',
    analyze: 'stepLabels.analyze',
    cast: 'stepLabels.cast',
    synth: 'stepLabels.synthFull',
    play: 'stepLabels.play',
};
type StepFooterProps = {
    canRetreat: boolean;
    canAdvance: boolean;
    onPrev: () => void;
    onNext: () => void;
    prevStep?: AudioBookStep;
    nextStep?: AudioBookStep;
};
export function StepFooter(props: StepFooterProps) {
    const { canRetreat, canAdvance, onPrev, onNext, prevStep, nextStep } = props;
    const { t } = useModTranslation('audio-book');
    const prevLabel = prevStep ? t(STEP_LABEL_KEYS[prevStep]) : t('stepLabels.previous');
    const nextLabel = nextStep ? t(STEP_LABEL_KEYS[nextStep]) : t('stepLabels.next');
    return (<footer className="flex items-center justify-between border-t border-gray-200 bg-white px-6 py-3">
      {canRetreat ? (<button type="button" onClick={onPrev} className="flex items-center gap-1.5 rounded-md border border-gray-200 px-4 py-2 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>
          </svg>
          {prevLabel}
        </button>) : (<div />)}

      {canAdvance ? (<button type="button" onClick={onNext} className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-5 py-2 text-xs font-medium text-white transition-colors hover:bg-indigo-700">
          {nextLabel}
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
          </svg>
        </button>) : (<div />)}
    </footer>);
}
