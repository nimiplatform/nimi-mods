// ---------------------------------------------------------------------------
// Import dialog — redesigned with Radix Dialog, drag-drop, improved styling
// ---------------------------------------------------------------------------

import React, { useCallback, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Button } from '../ui/button.js';

type ImportDialogProps = {
  open: boolean;
  onClose: () => void;
  onImportFile: (file: File) => void;
  onImportText: (text: string, title?: string) => void;
  onImportUrl: (url: string, title?: string) => void;
  isImporting: boolean;
};

type ImportMode = 'file' | 'paste' | 'url';

function UploadIcon() {
  return (
    <svg className="h-8 w-8 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

const MODE_TABS: Array<{ id: ImportMode; label: string; icon: string }> = [
  { id: 'file', label: 'File', icon: '📄' },
  { id: 'paste', label: 'Text', icon: '📝' },
  { id: 'url', label: 'URL', icon: '🔗' },
];

export function ImportDialog(props: ImportDialogProps) {
  const { open, onClose, onImportFile, onImportText, onImportUrl, isImporting } = props;
  const [mode, setMode] = useState<ImportMode>('file');
  const [pasteText, setPasteText] = useState('');
  const [pasteTitle, setPasteTitle] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [urlTitle, setUrlTitle] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportFile(file);
      onClose();
    }
  }, [onImportFile, onClose]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      onImportFile(file);
      onClose();
    }
  }, [onImportFile, onClose]);

  const handlePasteSubmit = useCallback(() => {
    if (!pasteText.trim()) return;
    onImportText(pasteText, pasteTitle || undefined);
    setPasteText('');
    setPasteTitle('');
    onClose();
  }, [pasteText, pasteTitle, onImportText, onClose]);

  const handleUrlSubmit = useCallback(() => {
    if (!urlInput.trim()) return;
    onImportUrl(urlInput, urlTitle || undefined);
    setUrlInput('');
    setUrlTitle('');
    onClose();
  }, [urlInput, urlTitle, onImportUrl, onClose]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay data-nimi-mod-portal="knowledge-base" className="fixed inset-0 z-40 bg-black/30" />
        <DialogPrimitive.Content data-nimi-mod-portal="knowledge-base" className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-gray-200 bg-white shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <DialogPrimitive.Title className="text-sm font-semibold text-gray-900">
              Import Document
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <CloseIcon />
              </button>
            </DialogPrimitive.Close>
          </div>

          {/* Mode tabs */}
          <div className="flex border-b border-gray-100">
            {MODE_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMode(tab.id)}
                className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors ${
                  mode === tab.id
                    ? 'border-b-2 border-indigo-600 text-indigo-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="p-5">
            {mode === 'file' && (
              <div
                className={`flex flex-col items-center gap-3 rounded-lg border-2 border-dashed px-6 py-8 transition-colors ${
                  isDragging ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 bg-gray-50'
                }`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
              >
                <UploadIcon />
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-700">
                    Drop file here or{' '}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-indigo-600 hover:text-indigo-700"
                    >
                      browse
                    </button>
                  </p>
                  <p className="mt-1 text-[11px] text-gray-400">
                    Supports .txt, .md, .csv, .json, .html
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md,.markdown,.csv,.json,.html,.htm"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            )}

            {mode === 'paste' && (
              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-700">Title (optional)</label>
                  <input
                    type="text"
                    value={pasteTitle}
                    onChange={(e) => setPasteTitle(e.target.value)}
                    placeholder="Document title"
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-900 placeholder:text-gray-400 focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">Content</label>
                  <textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder="Paste your text here..."
                    rows={6}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-900 placeholder:text-gray-400 focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={handlePasteSubmit}
                  disabled={isImporting || !pasteText.trim()}
                  className="self-end"
                >
                  {isImporting ? 'Importing...' : 'Import Text'}
                </Button>
              </div>
            )}

            {mode === 'url' && (
              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-700">Title (optional)</label>
                  <input
                    type="text"
                    value={urlTitle}
                    onChange={(e) => setUrlTitle(e.target.value)}
                    placeholder="Document title"
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-900 placeholder:text-gray-400 focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700">URL</label>
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://example.com/article"
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-900 placeholder:text-gray-400 focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={handleUrlSubmit}
                  disabled={isImporting || !urlInput.trim()}
                  className="self-end"
                >
                  {isImporting ? 'Fetching...' : 'Import URL'}
                </Button>
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
