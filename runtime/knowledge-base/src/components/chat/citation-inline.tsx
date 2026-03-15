// ---------------------------------------------------------------------------
// Inline citation marker — redesigned chip style
// ---------------------------------------------------------------------------

import React from 'react';

type CitationInlineProps = {
  refIndex: number;
  onClick: () => void;
};

export function CitationInline(props: CitationInlineProps) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="inline rounded-sm px-0.5 align-baseline text-[0.9em] font-medium text-indigo-600 underline decoration-indigo-200 underline-offset-2 hover:bg-indigo-50 hover:text-indigo-700"
      title={`Reference ${props.refIndex}`}
    >
      [{props.refIndex}]
    </button>
  );
}
