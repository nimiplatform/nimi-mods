// ---------------------------------------------------------------------------
// Document card — redesigned with icon, progress, and menu
// ---------------------------------------------------------------------------
import React, { useState } from 'react';
import type { KBDocument } from '../../types.js';
import { DocumentStatusBadge } from './document-status-badge.js';
import { Progress } from '../ui/progress.js';
import { useModTranslation } from "@nimiplatform/sdk/mod";
type DocumentCardProps = {
    document: KBDocument;
    onDelete: (docId: string) => void;
    onRetry?: (docId: string) => void;
};
function formatFileSize(bytes: number): string {
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}
// File type icon based on sourceKind or mimeType
function FileIcon({ sourceKind, mimeType }: {
    sourceKind: string;
    mimeType: string;
}) {
    if (sourceKind === 'url') {
        return (<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50">
        <svg className="h-5 w-5 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="2" y1="12" x2="22" y2="12"/>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>
      </div>);
    }
    if (mimeType.includes('json')) {
        return (<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-50">
        <svg className="h-5 w-5 text-orange-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="16 18 22 12 16 6"/>
          <polyline points="8 6 2 12 8 18"/>
        </svg>
      </div>);
    }
    // Default file-text icon
    return (<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50">
      <svg className="h-5 w-5 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
    </div>);
}
function getProcessingProgress(status: string): number {
    switch (status) {
        case 'parsing': return 25;
        case 'chunking': return 55;
        case 'embedding': return 80;
        default: return 0;
    }
}
function EllipsisIcon() {
    return (<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="1"/>
      <circle cx="19" cy="12" r="1"/>
      <circle cx="5" cy="12" r="1"/>
    </svg>);
}
function RetryIcon() {
    return (<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10"/>
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
    </svg>);
}
export function DocumentCard(props: DocumentCardProps) {
    const { t } = useModTranslation('knowledge-base');
    const { document: doc, onDelete, onRetry } = props;
    const [menuOpen, setMenuOpen] = useState(false);
    const isProcessing = ['parsing', 'chunking', 'embedding'].includes(doc.status);
    const isError = doc.status === 'error';
    return (<div className={`flex items-center gap-4 rounded-lg border bg-white p-4 transition-colors hover:border-gray-300 ${isError ? 'border-red-200' : 'border-gray-200'}`}>
      <FileIcon sourceKind={doc.sourceKind} mimeType={doc.mimeType}/>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-gray-900">{doc.title}</h3>
          <DocumentStatusBadge status={doc.status}/>
        </div>

        <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-400">
              <span>{formatFileSize(doc.fileSize)}</span>
              <span>&middot;</span>
              {doc.chunkCount > 0 && (<>
                  <span>{t('documents.chunks', { count: doc.chunkCount })}</span>
                  <span>&middot;</span>
                </>)}
              <span>{formatDate(doc.updatedAt)}</span>
              <span>&middot;</span>
              <span className="capitalize">{doc.sourceKind === 'paste' ? t('documents.sourcePaste') : doc.sourceKind === 'url' ? t('documents.sourceUrl') : t('documents.sourceFile')}</span>
            </div>

        {isProcessing && (<div className="mt-2">
            <Progress value={getProcessingProgress(doc.status)} className="h-1.5"/>
          </div>)}

        {doc.errorReason && (<p className="mt-1.5 text-[11px] text-red-500">{doc.errorReason}</p>)}

        {doc.tags.length > 0 && (<div className="mt-2 flex flex-wrap gap-1">
            {doc.tags.map((tag) => (<span key={tag} className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                {tag}
              </span>))}
          </div>)}
      </div>

      {/* Actions */}
      <div className="relative flex shrink-0 items-center gap-1">
        {isError && onRetry && (<button type="button" onClick={() => onRetry(doc.id)} className="rounded-md p-1.5 text-indigo-600 hover:bg-indigo-50" title={t('documents.retry')}>
            <RetryIcon />
          </button>)}
        <button type="button" onClick={() => setMenuOpen(!menuOpen)} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
          <EllipsisIcon />
        </button>

        {menuOpen && (<>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)}/>
            <div className="absolute right-0 top-8 z-20 min-w-[120px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
              {isError && onRetry && (<button type="button" onClick={() => { onRetry(doc.id); setMenuOpen(false); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
                  <RetryIcon />
                  {t('documents.retry')}
                </button>)}
              <button type="button" onClick={() => { onDelete(doc.id); setMenuOpen(false); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                {t('documents.delete')}
              </button>
            </div>
          </>)}
      </div>
    </div>);
}
