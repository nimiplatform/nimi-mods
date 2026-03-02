// ---------------------------------------------------------------------------
// Audio Book shell — header + content + footer layout
// ---------------------------------------------------------------------------

import React from 'react';

type AudioBookShellProps = {
  header: React.ReactNode;
  content: React.ReactNode;
  footer: React.ReactNode;
  error?: string | null;
  onDismissError?: () => void;
  confirmDialog?: { message: string; onConfirm: () => void } | null;
  onDismissConfirm?: () => void;
};

export function AudioBookShell(props: AudioBookShellProps) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-gray-50">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
        {props.header}
      </header>

      {/* Error banner */}
      {props.error && (
        <div className="flex items-center justify-between bg-red-50 px-4 py-2 text-xs text-red-700">
          <span>{props.error}</span>
          <button
            type="button"
            onClick={props.onDismissError}
            className="ml-2 rounded px-2 py-0.5 text-red-500 hover:bg-red-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Confirm dialog */}
      {props.confirmDialog && (
        <div className="flex items-center justify-between bg-amber-50 px-4 py-2 text-xs text-amber-800">
          <span>{props.confirmDialog.message}</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={props.onDismissConfirm}
              className="rounded px-2 py-0.5 text-amber-600 hover:bg-amber-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={props.confirmDialog.onConfirm}
              className="rounded bg-amber-600 px-2 py-0.5 text-white hover:bg-amber-700"
            >
              Confirm
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="min-h-0 flex-1 overflow-y-auto">
        {props.content}
      </main>

      {/* Footer */}
      {props.footer}
    </div>
  );
}
