// ---------------------------------------------------------------------------
// Temporary UI state hook — non-persistent ephemeral state
// ---------------------------------------------------------------------------

import { useCallback, useState } from 'react';

export type KBUiState = {
  error: string | null;
  setError: (error: string | null) => void;
  clearError: () => void;

  isImporting: boolean;
  setIsImporting: (v: boolean) => void;

  isSending: boolean;
  setIsSending: (v: boolean) => void;

  streamingText: string;
  setStreamingText: (text: string) => void;
  appendStreamingText: (delta: string) => void;
  clearStreamingText: () => void;

  importDialogOpen: boolean;
  setImportDialogOpen: (v: boolean) => void;

  citationPanelChunkId: string | null;
  setCitationPanelChunkId: (id: string | null) => void;

  confirmDialog: { message: string; onConfirm: () => void } | null;
  setConfirmDialog: (dialog: { message: string; onConfirm: () => void } | null) => void;
};

export function useKBUiState(): KBUiState {
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [citationPanelChunkId, setCitationPanelChunkId] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);

  const clearError = useCallback(() => setError(null), []);
  const appendStreamingText = useCallback((delta: string) => {
    setStreamingText((prev) => prev + delta);
  }, []);
  const clearStreamingText = useCallback(() => setStreamingText(''), []);

  return {
    error,
    setError,
    clearError,
    isImporting,
    setIsImporting,
    isSending,
    setIsSending,
    streamingText,
    setStreamingText,
    appendStreamingText,
    clearStreamingText,
    importDialogOpen,
    setImportDialogOpen,
    citationPanelChunkId,
    setCitationPanelChunkId,
    confirmDialog,
    setConfirmDialog,
  };
}
