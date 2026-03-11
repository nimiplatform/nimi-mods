// ---------------------------------------------------------------------------
// Citation detail panel — redesigned with better structure
// ---------------------------------------------------------------------------

import React, { useEffect } from 'react';
import type { KBCitation } from '../../types.js';

type CitationPanelProps = {
  citations: KBCitation[];
  activeCitationChunkId: string | null;
  onClose: () => void;
};

function CloseIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function BookOpenIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

export function CitationPanel(props: CitationPanelProps) {
  const { citations, activeCitationChunkId, onClose } = props;

  // Escape key to close
  useEffect(() => {
    if (!activeCitationChunkId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeCitationChunkId, onClose]);

  if (!activeCitationChunkId) return null;

  const citation = citations.find((c) => c.chunkId === activeCitationChunkId);
  if (!citation) return null;

  return (
    <div className="border-t border-gray-200 bg-white px-5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-5 items-center rounded bg-indigo-100 px-1.5 text-[10px] font-bold text-indigo-700">
              [{citation.refIndex}]
            </span>
            <div className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
              <BookOpenIcon />
              <span className="truncate">{citation.documentTitle}</span>
            </div>
            <span className="shrink-0 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700">
              {(citation.score * 100).toFixed(0)}% match
            </span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-gray-600">{citation.snippet}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}
