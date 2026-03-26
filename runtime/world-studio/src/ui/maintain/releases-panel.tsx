import React, { useMemo, useState } from 'react';
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

type ReleaseInspectState = {
  eyebrow: string;
  title: string;
  summary: string;
  meta: Array<{ label: string; value: string }>;
};

function ReleaseInspectDrawer(props: {
  value: ReleaseInspectState | null;
  onClose: () => void;
}): React.ReactElement | null {
  const { t } = useModTranslation('world-studio');
  if (!props.value) return null;

  return (
    <>
      <button
        type="button"
        aria-label={t('shared.close')}
        className="fixed inset-0 z-40 bg-slate-900/12 backdrop-blur-[1px]"
        onClick={props.onClose}
      />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-[380px] max-w-[92vw] flex-col border-l border-white/70 bg-[#f8fbfb] shadow-[-12px_0_28px_rgba(15,23,42,0.10)]">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              {props.value.eyebrow}
            </p>
            <h3 className="mt-1 text-base font-semibold text-slate-900">{props.value.title}</h3>
          </div>
          <button
            type="button"
            className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600"
            onClick={props.onClose}
          >
            {t('shared.close')}
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700">
            <p className="font-semibold text-slate-900">{props.value.summary}</p>
          </div>
          <div className="space-y-2">
            {props.value.meta.map((item) => (
              <div key={`${item.label}:${item.value}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                <p className="font-medium text-slate-500">{item.label}</p>
                <p className="mt-1 break-all text-slate-900">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </>
  );
}

function ReleaseListRow(props: {
  title: string;
  summary: string;
  badges?: string[];
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  onInspect: () => void;
}): React.ReactElement {
  const { t } = useModTranslation('world-studio');
  return (
    <div className="rounded-[18px] border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{props.title}</p>
          <p className="mt-1 text-xs text-slate-600">{props.summary}</p>
          {props.badges && props.badges.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {props.badges.map((badge) => (
                <span key={badge} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                  {badge}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
            onClick={props.onInspect}
          >
            {t('releases.inspect.open')}
          </button>
          {props.primaryActionLabel && props.onPrimaryAction ? (
            <button
              type="button"
              className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-slate-900 bg-slate-900 px-3 py-1 text-xs font-semibold text-white"
              onClick={props.onPrimaryAction}
            >
              {props.primaryActionLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ReleaseDraftsPanel(props: {
  drafts: WorldDraftSummary[];
  selectedDraftId: string;
  onOpenCreate: (draftId: string | null) => void;
}): React.ReactElement {
  const { t } = useModTranslation('world-studio');
  const [inspect, setInspect] = useState<ReleaseInspectState | null>(null);
  const selectedDraft = props.drafts.find((draft) => draft.id === props.selectedDraftId) || null;
  const summaryCards = [
    { label: t('releases.drafts.summary.total'), value: String(props.drafts.length) },
    { label: t('releases.drafts.summary.active'), value: selectedDraft ? selectedDraft.id : t('releases.shared.none') },
    { label: t('releases.drafts.summary.publishable'), value: String(props.drafts.filter((draft) => draft.status === 'PUBLISH').length) },
  ];
  return (
    <>
      <section className="ui-sync-card ui-sync-card-inset p-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{t('releases.drafts.title')}</h3>
          <p className="mt-1 text-xs text-gray-500">{t('releases.drafts.description')}</p>
        </div>
        <div className="mt-3">
          <SummaryCards items={summaryCards} />
        </div>
        <div className="mt-3 space-y-3">
          {props.drafts.length === 0 ? (
            <p className="text-xs text-gray-500">{t('releases.drafts.empty')}</p>
          ) : props.drafts.map((draft) => (
            <ReleaseListRow
              key={draft.id}
              title={draft.id}
              summary={t('releases.drafts.statusLine', {
                status: draft.status,
                updatedAt: draft.updatedAt || '-',
              })}
              badges={[
                draft.sourceType,
                draft.publishedAt ? t('releases.drafts.published') : t('releases.drafts.unpublished'),
              ]}
              primaryActionLabel={t('releases.drafts.continue')}
              onPrimaryAction={() => props.onOpenCreate(draft.id)}
              onInspect={() => setInspect({
                eyebrow: t('releases.inspect.draftEyebrow'),
                title: draft.id,
                summary: t('releases.drafts.statusLine', {
                  status: draft.status,
                  updatedAt: draft.updatedAt || '-',
                }),
                meta: [
                  { label: t('releases.inspect.targetWorld'), value: draft.targetWorldId || t('releases.shared.none') },
                  { label: t('releases.inspect.sourceType'), value: draft.sourceType },
                  { label: t('releases.inspect.sourceRef'), value: draft.sourceRef || t('releases.shared.none') },
                  { label: t('releases.inspect.publishedAt'), value: draft.publishedAt || t('releases.shared.none') },
                ],
              })}
            />
          ))}
        </div>
      </section>
      <ReleaseInspectDrawer value={inspect} onClose={() => setInspect(null)} />
    </>
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
  const summaryCards = [
    { label: t('releases.publish.currentWorldLabel'), value: props.world?.name || props.world?.id || t('releases.publish.noWorldSelected') },
    { label: t('releases.publish.latestDraftLabel'), value: props.selectedDraftId || t('releases.publish.noDraftSelected') },
    { label: t('releases.publish.maintainStateLabel'), value: props.dirtyLabel },
  ];
  return (
    <section className="ui-sync-card ui-sync-card-inset p-4">
      <h3 className="text-sm font-semibold text-gray-900">{t('releases.publish.title')}</h3>
      <p className="mt-1 text-xs text-gray-500">{t('releases.publish.description')}</p>
      <div className="mt-3">
        <SummaryCards items={summaryCards} />
      </div>
      <div className={`mt-3 rounded-[18px] border px-3 py-3 text-xs ${
        props.hasDirty
          ? 'border-amber-200 bg-amber-50 text-amber-800'
          : 'border-emerald-200 bg-emerald-50 text-emerald-800'
      }`}>
        {props.hasDirty
          ? t('releases.publish.recommendationDirty')
          : t('releases.publish.recommendationReady')}
      </div>
      <div className="mt-3 rounded-[18px] border border-slate-200 bg-white p-3 text-xs text-slate-700">
        <p className="font-semibold text-slate-900">{t('releases.publish.nextStepTitle')}</p>
        <p className="mt-1">{t('releases.publish.nextStepBody')}</p>
        <button
          type="button"
          className="mt-3 rounded-full border border-slate-900 bg-slate-900 px-3 py-1 text-xs font-semibold text-white"
          onClick={() => props.onOpenCreate(props.selectedDraftId || null)}
        >
          {t('releases.publish.openFlow')}
        </button>
      </div>
    </section>
  );
}

export function ReleaseHistoryPanel(props: {
  mutations: WorldMutationSummary[];
}): React.ReactElement {
  const { t } = useModTranslation('world-studio');
  const [inspect, setInspect] = useState<ReleaseInspectState | null>(null);
  const mutations = useMemo(
    () => [...props.mutations].sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt))),
    [props.mutations],
  );
  const summaryCards = [
    { label: t('releases.history.summary.total'), value: String(mutations.length) },
    { label: t('releases.history.summary.latest'), value: mutations[0]?.title || t('releases.shared.none') },
    { label: t('releases.history.summary.targets'), value: String(new Set(mutations.map((mutation) => mutation.targetPath || '-')).size) },
  ];
  return (
    <>
      <section className="ui-sync-card ui-sync-card-inset p-4">
        <h3 className="text-sm font-semibold text-gray-900">{t('releases.history.title')}</h3>
        <p className="mt-1 text-xs text-gray-500">{t('releases.history.description')}</p>
        <div className="mt-3">
          <SummaryCards items={summaryCards} />
        </div>
        <div className="mt-3 space-y-3">
          {mutations.length === 0 ? (
            <p className="text-xs text-gray-500">{t('releases.history.empty')}</p>
          ) : mutations.map((mutation) => (
            <ReleaseListRow
              key={mutation.id}
              title={mutation.title}
              summary={mutation.summary}
              badges={[mutation.mutationType, mutation.createdAt]}
              onInspect={() => setInspect({
                eyebrow: t('releases.inspect.historyEyebrow'),
                title: mutation.title,
                summary: mutation.summary,
                meta: [
                  { label: t('releases.inspect.targetPath'), value: mutation.targetPath || t('releases.history.noTargetPath') },
                  { label: t('releases.inspect.reason'), value: mutation.reason || t('releases.shared.none') },
                  { label: t('releases.inspect.creator'), value: mutation.creatorId },
                  { label: t('releases.inspect.createdAt'), value: mutation.createdAt },
                ],
              })}
            />
          ))}
        </div>
      </section>
      <ReleaseInspectDrawer value={inspect} onClose={() => setInspect(null)} />
    </>
  );
}
