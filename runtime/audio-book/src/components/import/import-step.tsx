// ---------------------------------------------------------------------------
// Import step — centered layout with drag-drop + text paste (matches Pencil)
// ---------------------------------------------------------------------------

import React, { useCallback, useRef, useState } from 'react';
import type { TextStats } from '../../types.js';
import { splitTextIntoChapters, computeTextStats } from '../../services/chapter-splitter.js';

type ImportStepProps = {
  importText: string;
  importLoading: boolean;
  projectName: string;
  onImport: (text: string, name: string) => void;
  onNameChange?: (name: string) => void;
};

export function ImportStep(props: ImportStepProps) {
  const { importText, importLoading, onImport, onNameChange } = props;
  const [text, setText] = useState(importText);
  const [name, setName] = useState(props.projectName);
  const [stats, setStats] = useState<TextStats | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [statsExpanded, setStatsExpanded] = useState(true);
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
    <div className="flex h-full flex-col items-center overflow-y-auto px-6 py-10">
      {/* Title section */}
      <div className="mb-8 text-center">
        <h2 className="text-2xl font-semibold text-gray-900">Import Your Text</h2>
        <p className="mt-2 text-sm text-gray-500">Upload or paste your novel text to get started</p>
      </div>

      <div className="w-full max-w-lg">
        {/* Project name */}
        <div className="mb-6">
          <label className="mb-1.5 block text-[13px] font-medium text-gray-900">Project Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => onNameChange?.(name)}
            placeholder="My Audiobook Project"
            className="w-full rounded-md border border-gray-200 px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* File upload zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`mb-6 flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-12 transition-all ${
            dragOver
              ? 'border-indigo-400 bg-indigo-50'
              : 'border-gray-200 bg-gray-50 hover:border-gray-300'
          }`}
        >
          <svg className="mb-3 h-8 w-8 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <p className="text-sm text-gray-500">
            Drag &amp; drop your .txt file here, or{' '}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="font-medium text-indigo-600 hover:underline"
            >
              browse
            </button>
          </p>
          <p className="mt-1.5 text-xs text-gray-400">or paste text directly below</p>
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
        <div className="mb-6">
          <textarea
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            onPaste={handlePaste}
            rows={6}
            placeholder="Paste your novel text here..."
            className="w-full rounded-md border border-gray-200 px-3 py-3 text-[13px] leading-relaxed text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Stats */}
        {stats && (
          <div className="mb-6 rounded-lg border border-gray-200 bg-white">
            <button
              type="button"
              onClick={() => setStatsExpanded(!statsExpanded)}
              className="flex w-full items-center justify-between px-4 py-2.5 text-left"
            >
              <p className="text-xs font-medium text-gray-700">
                {stats.totalChars.toLocaleString()} chars &middot; {stats.totalChapters} chapter{stats.totalChapters !== 1 ? 's' : ''}
              </p>
              <svg
                className={`h-4 w-4 text-gray-400 transition-transform ${statsExpanded ? 'rotate-180' : ''}`}
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </button>
            {statsExpanded && (
              <div className="border-t border-gray-100 px-4 py-2.5">
                <div className="flex flex-wrap gap-2">
                  {stats.chapterStats.map((ch) => (
                    <span
                      key={ch.index}
                      className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[10px] text-gray-600"
                    >
                      Ch{ch.index + 1}: {ch.title} ({ch.charCount.toLocaleString()})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Import button */}
        <button
          type="button"
          disabled={!text.trim() || importLoading}
          onClick={() => onImport(text, name)}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
        >
          {importLoading ? 'Importing...' : 'Import & Continue'}
          {!importLoading && (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
