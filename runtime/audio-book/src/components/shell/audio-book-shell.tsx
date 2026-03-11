// ---------------------------------------------------------------------------
// Audio Book shell — header + content + footer layout with toast error + dialog
// ---------------------------------------------------------------------------

import React, { useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from '../ui/dialog.js';

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
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Show toast when error changes
  useEffect(() => {
    if (props.error) {
      setToastVisible(true);
      // Auto-dismiss after 6 seconds
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => {
        setToastVisible(false);
        props.onDismissError?.();
      }, 6000);
    } else {
      setToastVisible(false);
    }
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [props.error]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismissToast = () => {
    setToastVisible(false);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    props.onDismissError?.();
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-gray-50">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
        {props.header}
      </header>

      {/* Toast error */}
      {toastVisible && props.error && (
        <div className="absolute right-4 top-14 z-30 flex max-w-sm items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 shadow-lg">
          <svg className="mt-0.5 h-4 w-4 shrink-0 text-red-500" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
          </svg>
          <p className="min-w-0 flex-1 text-xs text-red-700">{props.error}</p>
          <button
            type="button"
            onClick={dismissToast}
            className="shrink-0 rounded p-0.5 text-red-400 hover:bg-red-100 hover:text-red-600"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
      )}

      {/* Confirm dialog */}
      <ConfirmDialog
        open={Boolean(props.confirmDialog)}
        message={props.confirmDialog?.message ?? ''}
        onConfirm={() => props.confirmDialog?.onConfirm()}
        onCancel={() => props.onDismissConfirm?.()}
      />

      {/* Main content */}
      <main className="min-h-0 flex-1 overflow-y-auto">
        {props.content}
      </main>

      {/* Footer */}
      {props.footer}
    </div>
  );
}
