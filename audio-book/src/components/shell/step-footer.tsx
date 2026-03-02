// ---------------------------------------------------------------------------
// Step footer — prev/next navigation buttons
// ---------------------------------------------------------------------------

import React from 'react';

type StepFooterProps = {
  canRetreat: boolean;
  canAdvance: boolean;
  onPrev: () => void;
  onNext: () => void;
  nextLabel?: string;
};

export function StepFooter(props: StepFooterProps) {
  const { canRetreat, canAdvance, onPrev, onNext, nextLabel } = props;

  return (
    <footer className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-2">
      <button
        type="button"
        disabled={!canRetreat}
        onClick={onPrev}
        className={`rounded-lg px-4 py-1.5 text-sm font-medium ${
          canRetreat
            ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            : 'bg-gray-50 text-gray-300 cursor-default'
        }`}
      >
        Previous
      </button>
      <button
        type="button"
        disabled={!canAdvance}
        onClick={onNext}
        className={`rounded-lg px-4 py-1.5 text-sm font-medium ${
          canAdvance
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : 'bg-blue-200 text-blue-400 cursor-default'
        }`}
      >
        {nextLabel ?? 'Next'}
      </button>
    </footer>
  );
}
