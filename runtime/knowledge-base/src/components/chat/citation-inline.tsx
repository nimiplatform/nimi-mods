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
      className="inline-flex h-[18px] min-w-[1.25rem] items-center justify-center rounded bg-indigo-50 px-1 text-[9px] font-bold text-indigo-600 hover:bg-indigo-100"
      title={`Reference ${props.refIndex}`}
    >
      {props.refIndex}
    </button>
  );
}
