// ---------------------------------------------------------------------------
// Import step — project name + file upload/paste + text preview + chapter stats
// ---------------------------------------------------------------------------

import React, { useCallback, useRef, useState } from 'react';
import type { TextStats } from '../../types.js';
import { splitTextIntoChapters, computeTextStats } from '../../services/chapter-splitter.js';

type ImportStepProps = {
  importText: string;
  importLoading: boolean;
  projectName: string;
  onImport: (text: string, name: string) => void;
};

export function ImportStep(props: ImportStepProps) {
  const { importText, importLoading, onImport } = props;
  const [text, setText] = useState(importText);
  const [name, setName] = useState(props.projectName);
  const [stats, setStats] = useState<TextStats | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateStats = useCallback((value: string) => {
    if (!value.trim()) { setStats(null); return; }
    try {
      const chapters = splitTextIntoChapters(value);
      setStats(computeTextStats(chapters));
    } catch {
      setStats(null);
    }
  }, []);

  const handleTextChange = useCallback((value: string) => {
    setText(value);
    updateStats(value);
  }, [updateStats]);

  const handleFile = useCallback(async (file: File) => {
    const content = await file.text();
    setText(content);
    updateStats(content);
    if (!name.trim()) {
      setName(file.name.replace(/\.[^.]+$/, ''));
    }
  }, [name, updateStats]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text');
    if (pasted.length > 100) {
      e.preventDefault();
      handleTextChange(pasted);
    }
  }, [handleTextChange]);

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h3 className="mb-4 text-base font-semibold text-gray-900">Import Text</h3>

      {/* Project name */}
      <div className="mb-4">
        <label className="mb-1 block text-xs font-medium text-gray-600">Project Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Audiobook"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* File upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`mb-4 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
          dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-gray-50'
        }`}
      >
        <p className="text-sm text-gray-600">
          Drag &amp; drop a .txt file here, or{' '}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="font-medium text-blue-600 hover:underline"
          >
            browse
          </button>
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.text"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>

      {/* Text area */}
      <div className="mb-4">
        <label className="mb-1 block text-xs font-medium text-gray-600">Or paste text directly</label>
        <textarea
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          onPaste={handlePaste}
          rows={12}
          placeholder="Paste your novel/script text here..."
          className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs leading-relaxed outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Stats */}
      {stats && (
        <div className="mb-4 rounded-lg border border-gray-200 bg-white p-3">
          <p className="text-xs font-medium text-gray-700">
            {stats.totalChars.toLocaleString()} chars &middot; {stats.totalChapters} chapter{stats.totalChapters !== 1 ? 's' : ''}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {stats.chapterStats.map((ch) => (
              <span
                key={ch.index}
                className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600"
              >
                Ch{ch.index + 1}: {ch.title} ({ch.charCount.toLocaleString()})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Import button */}
      <button
        type="button"
        disabled={!text.trim() || importLoading}
        onClick={() => onImport(text, name)}
        className={`w-full rounded-lg px-4 py-2.5 text-sm font-medium ${
          text.trim() && !importLoading
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : 'bg-gray-200 text-gray-400 cursor-default'
        }`}
      >
        {importLoading ? 'Importing...' : 'Import & Continue'}
      </button>
    </div>
  );
}
