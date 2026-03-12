import React from 'react';
import { SourceInputProgressCard } from './source-input/progress-card.js';
import { SourceInputDiagnostics } from './source-input/diagnostics.js';
import type { RetryScope, SourceEncoding, SourceInputPanelProps } from './source-input/types.js';
import { useModTranslation } from "@nimiplatform/sdk/mod";
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
    const { t } = useModTranslation('world-studio');
    const hasFailedChunks = hasTerminalFailures(props.chunkTasks);
    const chunkPolicy = props.parseJob.chunkPolicy;
    return (<section className="ui-sync-card ui-sync-card-inset p-4">
      <h3 className="text-sm font-semibold text-gray-900">{t('sourceInput.title')}</h3>
      <p className="mt-1 text-xs text-gray-500">
        {t('sourceInput.description')}
      </p>

      <div className="mt-3">
        <label className="mb-1 block text-xs font-medium text-gray-700">{t('sourceInput.sourceFile')}</label>
        <div className="grid gap-2 md:grid-cols-[1fr_160px]">
          <input type="file" accept=".txt,.md,text/plain,text/markdown" className="h-9 w-full rounded-md border border-gray-300 px-2 text-xs" onChange={(event) => props.onSelectSourceFile(event.target.files?.[0] || null)}/>
          <select className="h-9 w-full rounded-md border border-gray-300 px-2 text-xs" value={props.sourceEncoding} onChange={(event) => props.onSourceEncodingChange(event.target.value as SourceEncoding)}>
            <option value="utf-8">UTF-8</option>
            <option value="gb18030">GB18030</option>
            <option value="utf-16le">UTF-16LE</option>
          </select>
        </div>
      </div>

      <input className="mt-3 h-9 w-full rounded-md border border-gray-300 px-3 text-xs" placeholder={t('sourceInput.sourceRefPlaceholder')} value={props.sourceRef} onChange={(event) => props.onSourceRefChange(event.target.value)}/>

      <textarea className="mt-2 h-56 w-full rounded-md border border-gray-300 p-3 text-xs" placeholder={props.sourceMode === 'FILE'
            ? t('sourceInput.filePreviewPlaceholder')
            : t('sourceInput.pasteSourcePlaceholder')} value={props.sourceMode === 'FILE' ? props.filePreviewText : props.sourceText} onChange={(event) => props.onSourceTextChange(event.target.value)} readOnly={props.sourceMode === 'FILE'}/>
      {props.sourceMode === 'FILE' ? (<p className="mt-1 text-[11px] text-gray-500">{t('sourceInput.filePreviewHint')}</p>) : null}

      <SourceInputProgressCard parseJob={props.parseJob}/>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="ui-sync-btn ui-sync-btn-primary rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60" onClick={props.onRunPhase1} disabled={props.working}>
          {t('sourceInput.runExtract')}
        </button>
        <button type="button" className="ui-sync-btn ui-sync-btn-selected rounded-md border border-brand-300 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 disabled:opacity-60" onClick={props.onRunFailedChunks} disabled={props.working || !hasFailedChunks || !props.onRunFailedChunks}>
          {t('sourceInput.retryFailedChunks')}
        </button>
      </div>
      {props.expertMode ? (<>
          {chunkPolicy ? (<div className="ui-sync-toolbar mt-3 p-2.5">
              <p className="text-[11px] font-semibold text-slate-700">{t('sourceInput.adaptiveChunking')}</p>
              <div className="mt-1 grid gap-1 text-[11px] text-slate-700 md:grid-cols-2">
                <p>{t('sourceInput.coarse')}: {chunkPolicy.coarseModel || '-'}</p>
                <p>{t('sourceInput.fine')}: {chunkPolicy.fineModel || '-'}</p>
                <p>{t('sourceInput.context')}: {chunkPolicy.effectiveContextTokens}</p>
                <p>{t('sourceInput.contextSource')}: {chunkPolicy.contextSource}</p>
                <p>{t('sourceInput.chunkSize')}: {chunkPolicy.chunkSize}</p>
                <p>{t('sourceInput.overlap')}: {chunkPolicy.overlap}</p>
              </div>
            </div>) : null}

          <label className="mt-2 inline-flex items-center gap-2 text-[11px] text-gray-600">
            <input type="checkbox" className="h-3.5 w-3.5 rounded border-gray-300" checked={Boolean(props.retryWithFineRoute)} onChange={(event) => props.onRetryWithFineRouteChange?.(event.target.checked)}/>
            {t('sourceInput.retryWithFineRoute')}
          </label>

          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <label className="text-[11px] text-gray-600">
              <span className="mb-1 block">{t('sourceInput.retryScope')}</span>
              <select className="h-8 w-full rounded-md border border-gray-300 px-2 text-[11px]" value={props.retryScope || 'all'} onChange={(event) => props.onRetryScopeChange?.(event.target.value as RetryScope)}>
                <option value="all">{t('sourceInput.retryScopeAll')}</option>
                <option value="json">{t('sourceInput.retryScopeJson')}</option>
                <option value="coarse">{t('sourceInput.retryScopeCoarse')}</option>
                <option value="fine">{t('sourceInput.retryScopeFine')}</option>
              </select>
            </label>
            <label className="text-[11px] text-gray-600">
              <span className="mb-1 block">{t('sourceInput.retryConcurrency')}</span>
              <select className="h-8 w-full rounded-md border border-gray-300 px-2 text-[11px]" value={Math.max(1, Math.min(3, props.retryConcurrency || 2))} onChange={(event) => props.onRetryConcurrencyChange?.(Math.max(1, Math.min(3, Number(event.target.value) || 2)))}>
                <option value={1}>{t('sourceInput.retryConcurrencySafe')}</option>
                <option value={2}>{t('sourceInput.retryConcurrencyRecommended')}</option>
                <option value={3}>{t('sourceInput.retryConcurrencyAggressive')}</option>
              </select>
            </label>
          </div>

          <SourceInputDiagnostics chunkTasks={props.chunkTasks} retryErrorCode={props.retryErrorCode} onRunFailedChunksByErrorCode={props.onRunFailedChunksByErrorCode} onClearRetryErrorCode={props.onClearRetryErrorCode} working={props.working}/>
        </>) : null}
    </section>);
}
