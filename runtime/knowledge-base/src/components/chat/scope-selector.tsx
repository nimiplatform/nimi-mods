// ---------------------------------------------------------------------------
// Document scope selector — redesigned with pill chips
// ---------------------------------------------------------------------------
import React from 'react';
import type { KBDocument } from '../../types.js';
import { useModTranslation } from "@nimiplatform/sdk/mod";
type ScopeSelectorProps = {
    documents: KBDocument[];
    selectedDocIds: string[];
    onChange: (docIds: string[]) => void;
};
export function ScopeSelector(props: ScopeSelectorProps) {
    const { t } = useModTranslation('knowledge-base');
    const { documents, selectedDocIds, onChange } = props;
    const readyDocs = documents.filter((d) => d.status === 'ready');
    if (readyDocs.length === 0)
        return null;
    const toggleDoc = (docId: string) => {
        if (selectedDocIds.includes(docId)) {
            onChange(selectedDocIds.filter((id) => id !== docId));
        }
        else {
            onChange([...selectedDocIds, docId]);
        }
    };
    return (<div className="flex items-center gap-2 border-b border-gray-100 bg-white px-5 py-2.5">
      <span className="text-[11px] font-medium text-gray-500">{t('chat.scope')}</span>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => onChange([])} className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${selectedDocIds.length === 0
            ? 'bg-indigo-600 text-white'
            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
          {t('chat.allDocuments')}
        </button>
        {readyDocs.map((doc) => (<button key={doc.id} type="button" onClick={() => toggleDoc(doc.id)} className={`max-w-[180px] truncate rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${selectedDocIds.includes(doc.id)
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
            {doc.title}
          </button>))}
      </div>
    </div>);
}
