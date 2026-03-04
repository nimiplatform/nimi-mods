// ---------------------------------------------------------------------------
// Knowledge Base shell — layout with toast + confirm dialog (redesigned)
// ---------------------------------------------------------------------------

import React, { useEffect, useState } from 'react';
import { ConfirmDialog } from '../ui/dialog.js';

type KBShellProps = {
  header: React.ReactNode;
  content: React.ReactNode;
  error?: string | null;
  onDismissError?: () => void;
  confirmDialog?: { message: string; onConfirm: () => void } | null;
  onDismissConfirm?: () => void;
};

function ErrorIcon() {
  return (
    <svg className="h-4 w-4 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function KBShell(props: KBShellProps) {
  const [toastVisible, setToastVisible] = useState(false);

  useEffect(() => {
    if (props.error) {
      setToastVisible(true);
      const timer = setTimeout(() => {
        setToastVisible(false);
        props.onDismissError?.();
      }, 6000);
      return () => clearTimeout(timer);
    }
    setToastVisible(false);
  }, [props.error]);

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-gray-50">
      {/* Header with nav tabs */}
      {props.header}

      {/* Main content */}
      <main className="min-h-0 flex-1 overflow-y-auto">
        {props.content}
      </main>

      {/* Toast error */}
      {toastVisible && props.error && (
        <div className="absolute right-4 top-14 z-30 flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-3 shadow-lg">
          <ErrorIcon />
          <span className="text-xs text-red-700">{props.error}</span>
          <button
            type="button"
            onClick={() => { setToastVisible(false); props.onDismissError?.(); }}
            className="ml-2 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <CloseIcon />
          </button>
        </div>
      )}

      {/* Confirm dialog */}
      {props.confirmDialog && (
        <ConfirmDialog
          open={true}
          message={props.confirmDialog.message}
          onConfirm={props.confirmDialog.onConfirm}
          onCancel={() => props.onDismissConfirm?.()}
          variant="destructive"
          confirmLabel="Delete"
        />
      )}
    </div>
  );
}
