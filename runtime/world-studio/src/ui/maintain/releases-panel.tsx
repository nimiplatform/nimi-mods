import React from 'react';
import type { WorldDraftSummary, WorldMutationSummary, WorldSummary } from '../../ui/types.js';
import { useModTranslation } from "@nimiplatform/sdk/mod";

export function ReleaseDraftsPanel(props: {
  drafts: WorldDraftSummary[];
  selectedDraftId: string;
  onOpenCreate: (draftId: string | null) => void;
}): React.ReactElement {
  const { t } = useModTranslation('world-studio');
  return (
    <section className="ui-sync-card ui-sync-card-inset p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{t('releases.drafts.title', 'Drafts')}</h3>
          <p className="mt-1 text-xs text-gray-500">
            {t('releases.drafts.description', 'Detailed draft selection now lives here; the workspace drawer keeps only quick entry points.')}
          </p>
        </div>
        <button
          type="button"
          className="ui-sync-btn ui-sync-btn-primary rounded-md px-3 py-1.5 text-xs font-semibold text-white"
          onClick={() => props.onOpenCreate(null)}
        >
          {t('releases.drafts.newDraft', 'New Draft')}
        </button>
      </div>
      <div className="mt-3 space-y-3">
        {props.drafts.length === 0 ? (
          <p className="text-xs text-gray-500">{t('releases.drafts.empty', 'No drafts are available.')}</p>
        ) : props.drafts.map((draft) => (
          <div key={draft.id} className="rounded-[18px] border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">{draft.id}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {t('releases.drafts.statusLine', 'Status: {{status}} · Updated: {{updatedAt}}', {
                    status: draft.status,
                    updatedAt: draft.updatedAt || '-',
                  })}
                </p>
              </div>
              <button
                type="button"
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  draft.id === props.selectedDraftId
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
                onClick={() => props.onOpenCreate(draft.id)}
              >
                {t('releases.drafts.continue', 'Continue')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ReleasePublishPanel(props: {
  world: WorldSummary | null;
  selectedDraftId: string;
  onOpenCreate: (draftId: string | null) => void;
}): React.ReactElement {
  const { t } = useModTranslation('world-studio');
  return (
    <section className="ui-sync-card ui-sync-card-inset p-4">
      <h3 className="text-sm font-semibold text-gray-900">{t('releases.publish.title', 'Publish')}</h3>
      <p className="mt-1 text-xs text-gray-500">
        {t(
          'releases.publish.description',
          'Publishing still runs through the Create review flow. Use this section to jump back into the current draft with the right mental model.',
        )}
      </p>
      <div className="mt-3 rounded-[18px] border border-slate-200 bg-white p-3 text-xs text-slate-700">
        <p>{t('releases.publish.currentWorld', 'Current world: {{value}}', {
          value: props.world?.name || props.world?.id || t('releases.publish.noWorldSelected', 'No world selected'),
        })}</p>
        <p className="mt-1">{t('releases.publish.latestDraft', 'Latest selected draft: {{value}}', {
          value: props.selectedDraftId || t('releases.publish.noDraftSelected', 'No draft selected'),
        })}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="ui-sync-btn ui-sync-btn-primary rounded-md px-3 py-1.5 text-xs font-semibold text-white"
          onClick={() => props.onOpenCreate(props.selectedDraftId || null)}
        >
          {t('releases.publish.openFlow', 'Open Publish Flow')}
        </button>
      </div>
    </section>
  );
}

export function ReleaseHistoryPanel(props: {
  mutations: WorldMutationSummary[];
}): React.ReactElement {
  const { t } = useModTranslation('world-studio');
  return (
    <section className="ui-sync-card ui-sync-card-inset p-4">
      <h3 className="text-sm font-semibold text-gray-900">{t('releases.history.title', 'History')}</h3>
      <p className="mt-1 text-xs text-gray-500">
        {t('releases.history.description', 'Mutation history is now a first-class release surface instead of a hidden background query.')}
      </p>
      <div className="mt-3 space-y-3">
        {props.mutations.length === 0 ? (
          <p className="text-xs text-gray-500">{t('releases.history.empty', 'No mutations recorded yet.')}</p>
        ) : props.mutations.map((mutation) => (
          <div key={mutation.id} className="rounded-[18px] border border-slate-200 bg-white p-3">
            <p className="text-sm font-semibold text-slate-900">{mutation.mutationType}</p>
            <p className="mt-1 text-xs text-slate-600">{mutation.targetPath || t('releases.history.noTargetPath', 'no target path')}</p>
            <p className="mt-1 text-xs text-slate-500">{mutation.createdAt}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
