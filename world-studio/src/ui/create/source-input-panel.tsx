import React from 'react';
import { SourceInputProgressCard } from './source-input/progress-card.js';
import { SourceInputDiagnostics } from './source-input/diagnostics.js';
import type { RetryScope, SourceEncoding, SourceInputPanelProps } from './source-input/types.js';

function hasTerminalFailures(chunkTasks: SourceInputPanelProps['chunkTasks']): boolean {
  const map = new Map<number, SourceInputPanelProps['chunkTasks'][number]>();
  chunkTasks.forEach((task) => {
    const existing = map.get(task.chunkIndex);
    if (!existing) {
      map.set(task.chunkIndex, task);
      return;
    }
    if (task.status === 'success' || existing.status !== 'success') {
      map.set(task.chunkIndex, task);
    }
  });
  return Array.from(map.values()).some((task) => task.status === 'failed');
}

export function SourceInputPanel(props: SourceInputPanelProps) {
  const hasFailedChunks = hasTerminalFailures(props.chunkTasks);
  const chunkPolicy = props.parseJob.chunkPolicy;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-900">Source Input</h3>
      <p className="mt-1 text-xs text-gray-500">
        Upload a txt/md file or paste raw text. Extraction runs chunk-by-chunk with progress tracking.
      </p>

      <div className="mt-3">
        <label className="mb-1 block text-xs font-medium text-gray-700">Source File (txt/md)</label>
        <div className="grid gap-2 md:grid-cols-[1fr_160px]">
          <input
            type="file"
            accept=".txt,.md,text/plain,text/markdown"
            className="h-9 w-full rounded-md border border-gray-300 px-2 text-xs"
            onChange={(event) => props.onSelectSourceFile(event.target.files?.[0] || null)}
          />
          <select
            className="h-9 w-full rounded-md border border-gray-300 px-2 text-xs"
            value={props.sourceEncoding}
            onChange={(event) => props.onSourceEncodingChange(event.target.value as SourceEncoding)}
          >
            <option value="utf-8">UTF-8</option>
            <option value="gb18030">GB18030</option>
            <option value="utf-16le">UTF-16LE</option>
          </select>
        </div>
      </div>

      <input
        className="mt-3 h-9 w-full rounded-md border border-gray-300 px-3 text-xs"
        placeholder="sourceRef (optional, e.g. s3://bucket/path)"
        value={props.sourceRef}
        onChange={(event) => props.onSourceRefChange(event.target.value)}
      />

      <textarea
        className="mt-2 h-56 w-full rounded-md border border-gray-300 p-3 text-xs"
        placeholder={props.sourceMode === 'FILE' ? 'File preview (read-only)...' : 'Paste source text...'}
        value={props.sourceMode === 'FILE' ? props.filePreviewText : props.sourceText}
        onChange={(event) => props.onSourceTextChange(event.target.value)}
        readOnly={props.sourceMode === 'FILE'}
      />
      {props.sourceMode === 'FILE' ? (
        <p className="mt-1 text-[11px] text-gray-500">Preview only. Parsing uses streaming chunks, not full UI text buffering.</p>
      ) : null}

      <SourceInputProgressCard parseJob={props.parseJob} />

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          onClick={props.onRunPhase1}
          disabled={props.working}
        >
          Run Ingest + Extract
        </button>
        <button
          type="button"
          className="rounded-md border border-brand-300 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 disabled:opacity-60"
          onClick={props.onRunFailedChunks}
          disabled={props.working || !hasFailedChunks || !props.onRunFailedChunks}
        >
          Retry Failed Chunks
        </button>
      </div>
      {props.expertMode ? (
        <>
          {chunkPolicy ? (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
              <p className="text-[11px] font-semibold text-slate-700">Adaptive Chunking</p>
              <div className="mt-1 grid gap-1 text-[11px] text-slate-700 md:grid-cols-2">
                <p>coarse: {chunkPolicy.coarseModel || '-'}</p>
                <p>fine: {chunkPolicy.fineModel || '-'}</p>
                <p>context: {chunkPolicy.effectiveContextTokens}</p>
                <p>source: {chunkPolicy.contextSource}</p>
                <p>chunkSize: {chunkPolicy.chunkSize}</p>
                <p>overlap: {chunkPolicy.overlap}</p>
              </div>
            </div>
          ) : null}

          <label className="mt-2 inline-flex items-center gap-2 text-[11px] text-gray-600">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded border-gray-300"
              checked={Boolean(props.retryWithFineRoute)}
              onChange={(event) => props.onRetryWithFineRouteChange?.(event.target.checked)}
            />
            Retry failed chunks with Fine route
          </label>

          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <label className="text-[11px] text-gray-600">
              <span className="mb-1 block">Retry Scope</span>
              <select
                className="h-8 w-full rounded-md border border-gray-300 px-2 text-[11px]"
                value={props.retryScope || 'all'}
                onChange={(event) => props.onRetryScopeChange?.(event.target.value as RetryScope)}
              >
                <option value="all">All Failed Chunks</option>
                <option value="json">JSON Parse Failed</option>
                <option value="coarse">Coarse Stage Failed</option>
                <option value="fine">Fine Stage Failed</option>
              </select>
            </label>
            <label className="text-[11px] text-gray-600">
              <span className="mb-1 block">Retry Concurrency</span>
              <select
                className="h-8 w-full rounded-md border border-gray-300 px-2 text-[11px]"
                value={Math.max(1, Math.min(3, props.retryConcurrency || 2))}
                onChange={(event) => props.onRetryConcurrencyChange?.(Math.max(1, Math.min(3, Number(event.target.value) || 2)))}
              >
                <option value={1}>1 (Safe)</option>
                <option value={2}>2 (Recommended)</option>
                <option value={3}>3 (Aggressive)</option>
              </select>
            </label>
          </div>

          <SourceInputDiagnostics
            chunkTasks={props.chunkTasks}
            retryErrorCode={props.retryErrorCode}
            onRunFailedChunksByErrorCode={props.onRunFailedChunksByErrorCode}
            onClearRetryErrorCode={props.onClearRetryErrorCode}
            working={props.working}
          />
        </>
      ) : null}
    </section>
  );
}
