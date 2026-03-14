import React from 'react';
import type { WorldDraftSummary, WorldMutationSummary, WorldSummary } from '../../ui/types.js';
import { useModTranslation } from "@nimiplatform/sdk/mod";

function SummaryCards(props: {
  items: Array<{ label: string; value: string }>;
}): React.ReactElement {
  return (
    <div className="grid gap-2 md:grid-cols-3">
      {props.items.map((item) => (
        <div key={item.label} className="rounded-2xl bg-[#eef5f5] px-3 py-2 text-xs text-slate-700">
          <p className="font-semibold">{item.value}</p>
          <p className="mt-1">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

export function ReleaseDraftsPanel(props: {
  drafts: WorldDraftSummary[];
  selectedDraftId: string;
  onOpenCreate: (draftId: string | null) => void;
}): React.ReactElement {
  const { t } = useModTranslation('world-studio');
  const selectedDraft = props.drafts.find((draft) => draft.id === props.selectedDraftId) || null;
  const summaryCards = [
    { label: t('releases.drafts.summary.total', 'Total drafts'), value: String(props.drafts.length) },
    { label: t('releases.drafts.summary.active', 'Selected draft'), value: selectedDraft ? selectedDraft.id : t('releases.shared.none', 'None') },
    { label: t('releases.drafts.summary.publishable', 'Published drafts'), value: String(props.drafts.filter((draft) => draft.status === 'PUBLISH').length) },
  ];
  return (
    <section className="ui-sync-card ui-sync-card-inset p-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">{t('releases.drafts.title', 'Drafts')}</h3>
        <p className="mt-1 text-xs text-gray-500">
          {t('releases.drafts.description', 'Detailed draft selection now lives here; the workspace drawer keeps only quick entry points.')}
        </p>
      </div>
      <div className="mt-3">
        <SummaryCards items={summaryCards} />
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
  dirtyLabel: string;
  hasDirty: boolean;
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
        <p className="mt-1">{t('releases.publish.maintainState', 'Maintain state: {{value}}', {
          value: props.dirtyLabel,
        })}</p>
      </div>
      <div className={`mt-3 rounded-[18px] border px-3 py-3 text-xs ${
        props.hasDirty
          ? 'border-amber-200 bg-amber-50 text-amber-800'
          : 'border-emerald-200 bg-emerald-50 text-emerald-800'
      }`}>
        {props.hasDirty
          ? t('releases.publish.recommendationDirty', 'Save or sync the current maintenance edits before entering the publish review flow.')
          : t('releases.publish.recommendationReady', 'The maintenance surface is clean. You can jump back into publish review when the draft is ready.')}
      </div>
    </section>
  );
}

export function ReleaseHistoryPanel(props: {
  mutations: WorldMutationSummary[];
}): React.ReactElement {
  const { t } = useModTranslation('world-studio');
  const mutations = [...props.mutations].sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
  const summaryCards = [
    { label: t('releases.history.summary.total', 'Mutations'), value: String(mutations.length) },
    { label: t('releases.history.summary.latest', 'Latest mutation'), value: mutations[0]?.mutationType || t('releases.shared.none', 'None') },
    { label: t('releases.history.summary.targets', 'Distinct targets'), value: String(new Set(mutations.map((mutation) => mutation.targetPath || '-')).size) },
  ];
  return (
    <section className="ui-sync-card ui-sync-card-inset p-4">
      <h3 className="text-sm font-semibold text-gray-900">{t('releases.history.title', 'History')}</h3>
      <p className="mt-1 text-xs text-gray-500">
        {t('releases.history.description', 'Mutation history is now a first-class release surface instead of a hidden background query.')}
      </p>
      <div className="mt-3">
        <SummaryCards items={summaryCards} />
      </div>
      <div className="mt-3 space-y-3">
        {mutations.length === 0 ? (
          <p className="text-xs text-gray-500">{t('releases.history.empty', 'No mutations recorded yet.')}</p>
        ) : mutations.map((mutation) => (
          <div key={mutation.id} className="rounded-[18px] border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">{mutation.mutationType}</p>
                <p className="mt-1 text-xs text-slate-600">{mutation.targetPath || t('releases.history.noTargetPath', 'no target path')}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                {mutation.createdAt}
              </span>
            </div>
            {mutation.reason ? (
              <p className="mt-2 text-xs text-slate-500">{mutation.reason}</p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
