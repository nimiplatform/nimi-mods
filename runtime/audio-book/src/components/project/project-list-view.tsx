// ---------------------------------------------------------------------------
// Project list view — card grid with create button (matches Pencil design)
// ---------------------------------------------------------------------------
import React, { useCallback, useState } from 'react';
import type { ProjectState } from '../../types.js';
import { useModTranslation } from "@nimiplatform/sdk/mod";
type ProjectMeta = {
    id: string;
    name: string;
    state: ProjectState;
    updatedAt: string;
};
type ProjectListViewProps = {
    projects: ProjectMeta[];
    onOpen: (id: string) => void;
    onCreate: (name: string) => void;
    onDelete: (id: string) => void;
};
const STATE_LABEL_KEYS: Record<ProjectState, string> = {
    draft: 'projectList.stateDraft',
    imported: 'projectList.stateImported',
    analyzing: 'projectList.stateAnalyzing',
    analyzed: 'projectList.stateAnalyzed',
    casting: 'projectList.stateCasting',
    cast_complete: 'projectList.stateCastComplete',
    synthesizing: 'projectList.stateSynthesizing',
    done: 'projectList.stateDone',
    done_with_errors: 'projectList.stateDoneWithErrors',
    cancelled: 'projectList.stateCancelled',
    paused: 'projectList.statePaused',
};
const STATE_COLORS: Record<ProjectState, string> = {
    draft: 'bg-gray-100 text-gray-600',
    imported: 'bg-indigo-50 text-indigo-600',
    analyzing: 'bg-amber-50 text-amber-600',
    analyzed: 'bg-indigo-50 text-indigo-600',
    casting: 'bg-amber-50 text-amber-600',
    cast_complete: 'bg-indigo-50 text-indigo-600',
    synthesizing: 'bg-amber-50 text-amber-600',
    done: 'bg-green-50 text-green-600',
    done_with_errors: 'bg-red-50 text-red-600',
    cancelled: 'bg-gray-100 text-gray-500',
    paused: 'bg-gray-100 text-gray-500',
};
export function ProjectListView(props: ProjectListViewProps) {
    const { projects, onOpen, onCreate, onDelete } = props;
    const { t } = useModTranslation('audio-book');
    const [newName, setNewName] = useState('');
    const [deleteConfirm, setDeleteConfirm] = useState<{
        id: string;
        name: string;
    } | null>(null);
    const handleDeleteClick = useCallback((e: React.MouseEvent, p: ProjectMeta) => {
        e.stopPropagation();
        setDeleteConfirm({ id: p.id, name: p.name });
    }, []);
    const handleDeleteConfirm = useCallback(() => {
        if (deleteConfirm) {
            onDelete(deleteConfirm.id);
            setDeleteConfirm(null);
        }
    }, [deleteConfirm, onDelete]);
    const handleCreate = () => {
        const name = newName.trim() || t('projectList.defaultName');
        onCreate(name);
        setNewName('');
    };
    return (<div className="flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <div className="shrink-0 border-b border-gray-100 bg-white px-8 py-6">
        <div className="flex items-center gap-3">
          <svg className="h-7 w-7 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
          </svg>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{t('projectList.studioTitle')}</h1>
            <p className="text-xs text-gray-500">{t('projectList.subtitle')}</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-8 py-6">
        {/* Create new project */}
        <div className="mb-8 flex items-center gap-3">
          <div className="relative min-w-0 flex-1">
            <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            <input type="text" placeholder={t('projectList.newProjectPlaceholder')} value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreate()} className="w-full rounded-md border border-gray-200 py-2.5 pl-9 pr-3 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"/>
          </div>
          <button type="button" onClick={handleCreate} className="shrink-0 rounded-md bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700">
            {t('projectList.createButton')}
          </button>
        </div>

        {/* Project grid */}
        {projects.length === 0 ? (<div className="flex flex-col items-center justify-center py-20">
            <svg className="mb-4 h-12 w-12 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
            </svg>
            <p className="text-sm font-medium text-gray-400">{t('projectList.noProjectsTitle')}</p>
            <p className="mt-1 text-xs text-gray-400">{t('projectList.noProjectsHint')}</p>
          </div>) : (<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (<div key={p.id} className="group relative rounded-lg border border-gray-200 bg-white transition-all hover:border-indigo-200 hover:shadow-sm">
                <button type="button" onClick={() => onOpen(p.id)} className="block w-full px-5 py-4 text-left">
                  <h3 className="truncate text-sm font-semibold text-gray-900 group-hover:text-indigo-600">
                    {p.name}
                  </h3>
                  <div className="mt-2.5 flex items-center gap-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${STATE_COLORS[p.state]}`}>
                      {t(STATE_LABEL_KEYS[p.state])}
                    </span>
                    <span className="text-[11px] text-gray-400">
                      {new Date(p.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </button>

                {/* Delete button */}
                <button type="button" onClick={(e) => handleDeleteClick(e, p)} className="absolute right-2.5 top-2.5 rounded-md p-1.5 text-gray-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100" title={t('projectList.deleteProject')}>
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18"/>
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                  </svg>
                </button>
              </div>))}
          </div>)}
      </div>

      {/* Delete confirm overlay */}
      {deleteConfirm && (<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="mx-4 w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-1 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
                <svg className="h-4 w-4 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18"/>
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-gray-900">{t('projectList.deleteTitle')}</h3>
            </div>
            <p className="mb-5 ml-10 text-xs text-gray-500">
              {t('projectList.deleteConfirm')} <span className="font-medium text-gray-700">{deleteConfirm.name}</span>{t('projectList.deleteWarning')}
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteConfirm(null)} className="rounded-md border border-gray-200 px-4 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50">
                {t('projectList.cancelButton')}
              </button>
              <button type="button" onClick={handleDeleteConfirm} className="rounded-md bg-red-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-red-700">
                {t('projectList.deleteButton')}
              </button>
            </div>
          </div>
        </div>)}
    </div>);
}
