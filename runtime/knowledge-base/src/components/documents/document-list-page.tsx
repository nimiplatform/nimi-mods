// ---------------------------------------------------------------------------
// Document list page — redesigned with search, empty state, header
// ---------------------------------------------------------------------------
import React, { useMemo, useState } from 'react';
import type { KBDocument } from '../../types.js';
import { DocumentCard } from './document-card.js';
import { ImportDialog } from './import-dialog.js';
import { Button } from '../ui/button.js';
import { useModTranslation } from "@nimiplatform/sdk/mod";
type DocumentListPageProps = {
    documents: KBDocument[];
    importDialogOpen: boolean;
    isImporting: boolean;
    onOpenImportDialog: () => void;
    onCloseImportDialog: () => void;
    onImportFile: (file: File) => void;
    onImportText: (text: string, title?: string) => void;
    onImportUrl: (url: string, title?: string) => void;
    onDelete: (docId: string) => void;
    onRetry?: (docId: string) => void;
};
function SearchIcon() {
    return (<svg className="h-4 w-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>);
}
function PlusIcon() {
    return (<svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/>
      <line x1="5" y1="12" x2="19" y2="12"/>
    </svg>);
}
function EmptyStateIcon() {
    return (<svg className="h-16 w-16 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="12" y1="18" x2="12" y2="12"/>
      <line x1="9" y1="15" x2="15" y2="15"/>
    </svg>);
}
export function DocumentListPage(props: DocumentListPageProps) {
    const { t } = useModTranslation('knowledge-base');
    const { documents, importDialogOpen, isImporting, onOpenImportDialog, onCloseImportDialog, onImportFile, onImportText, onImportUrl, onDelete, onRetry, } = props;
    const [searchQuery, setSearchQuery] = useState('');
    const filteredDocs = useMemo(() => {
        if (!searchQuery.trim())
            return documents;
        const q = searchQuery.toLowerCase();
        return documents.filter((doc) => doc.title.toLowerCase().includes(q)
            || doc.tags.some((t) => t.toLowerCase().includes(q)));
    }, [documents, searchQuery]);
    return (<div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">{t('documents.title')}</h2>
          <p className="text-xs text-gray-500">
            {documents.length === 0
            ? t('documents.empty')
            : documents.length === 1
                ? t('documents.countOne')
                : t('documents.countOther', { count: documents.length })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
            <SearchIcon />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={t('documents.searchPlaceholder')} className="w-48 bg-transparent text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none"/>
          </div>
          {/* Import button */}
          <Button size="sm" onClick={onOpenImportDialog}>
            <PlusIcon />
            {t('common.import')}
          </Button>
        </div>
      </div>

      {/* Document list or empty state */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {filteredDocs.length === 0 && documents.length === 0 ? (<div className="flex h-full flex-col items-center justify-center">
            <EmptyStateIcon />
            <h3 className="mt-4 text-sm font-semibold text-gray-700">{t('documents.firstTitle')}</h3>
            <p className="mt-1 text-xs text-gray-400">
              {t('documents.firstHint')}
            </p>
            <Button size="sm" className="mt-4" onClick={onOpenImportDialog}>
              <PlusIcon />
              {t('common.importDocument')}
            </Button>
          </div>) : filteredDocs.length === 0 ? (<div className="flex h-32 items-center justify-center">
            <p className="text-xs text-gray-400">{t('documents.noMatches', { query: searchQuery })}</p>
          </div>) : (<div className="flex flex-col gap-2">
            {filteredDocs.map((doc) => (<DocumentCard key={doc.id} document={doc} onDelete={onDelete} onRetry={onRetry}/>))}
          </div>)}
      </div>

      {/* Import dialog */}
      <ImportDialog open={importDialogOpen} onClose={onCloseImportDialog} onImportFile={onImportFile} onImportText={onImportText} onImportUrl={onImportUrl} isImporting={isImporting}/>
    </div>);
}
