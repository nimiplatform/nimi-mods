import React, { useMemo, useState } from 'react';
import type { WorldDraftSummary, WorldSummary } from '../ui/types.js';
import { worldStudioMessage } from '../i18n/messages.js';

function resolvePreferredId<T extends { id: string }>(items: T[], preferredId: string): string {
  if (preferredId && items.some((item) => item.id === preferredId)) {
    return preferredId;
  }
  return items[0]?.id || '';
}

export function WorkspacePanel(props: {
  worlds: WorldSummary[];
  drafts: WorldDraftSummary[];
  primaryWorld: WorldSummary | null;
  latestDraft: WorldDraftSummary | null;
  selectedWorldId: string;
  selectedDraftId: string;
  onRefresh: () => void;
  onOpenMaintenance: (worldId: string) => void;
  onOpenCreate: (draftId: string | null) => void;
}): React.ReactElement {
  const [worldOptionId, setWorldOptionId] = useState(() => resolvePreferredId(props.worlds, props.selectedWorldId));
  const [draftOptionId, setDraftOptionId] = useState(() => resolvePreferredId(props.drafts, props.selectedDraftId));

  const selectedWorld = useMemo(
    () => props.worlds.find((item) => item.id === worldOptionId) || props.primaryWorld || null,
    [props.primaryWorld, props.worlds, worldOptionId],
  );
  const selectedDraft = useMemo(
    () => props.drafts.find((item) => item.id === draftOptionId) || props.latestDraft || null,
    [draftOptionId, props.drafts, props.latestDraft],
  );

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[22px] leading-none font-semibold text-slate-900">
            {worldStudioMessage('workflow.workspaceTitle', 'Workspace')}
          </h3>
          <p className="mt-1 text-[12px] leading-5 text-slate-500">
            {worldStudioMessage('workflow.workspaceDescription', 'Switch between your world and draft workspaces.')}
          </p>
        </div>
        <button
          type="button"
          onClick={props.onRefresh}
          className="inline-flex h-8 min-w-[72px] items-center justify-center whitespace-nowrap rounded-2xl border border-gray-200 bg-white px-3 text-[12px] font-semibold text-slate-700 shadow-sm"
        >
          {worldStudioMessage('workflow.refresh', 'Refresh')}
        </button>
      </div>

      <div className="space-y-3 pt-1">
        <article className="rounded-[20px] border border-white/80 bg-white/90 p-3 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            {worldStudioMessage('workflow.publishedWorld', 'World')}
          </p>
          <select
            className="mt-2 h-10 w-full rounded-2xl border border-gray-200 bg-white px-3 text-[13px] text-slate-900"
            value={worldOptionId}
            onChange={(event) => setWorldOptionId(event.target.value)}
            disabled={props.worlds.length === 0}
          >
            {props.worlds.length === 0 ? (
              <option value="">{worldStudioMessage('workflow.noWorldOption', 'No world')}</option>
            ) : props.worlds.map((world) => (
              <option key={world.id} value={world.id}>
                {world.name || world.id}
              </option>
            ))}
          </select>
          <p className="mt-2 truncate text-[11px] text-slate-500">{selectedWorld?.id || '-'}</p>
          <button
            type="button"
            className="mt-2.5 inline-flex h-8 items-center rounded-2xl border border-gray-200 bg-white px-3.5 text-[12px] font-semibold text-slate-700 shadow-sm disabled:opacity-60"
            disabled={!selectedWorld}
            onClick={() => {
              if (selectedWorld) {
                props.onOpenMaintenance(selectedWorld.id);
              }
            }}
          >
            {worldStudioMessage('workflow.openMaintenance', 'Open maintenance')}
          </button>
        </article>

        <article className="rounded-[20px] border border-white/80 bg-white/90 p-3 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            {worldStudioMessage('workflow.draftWorkspace', 'Draft')}
          </p>
          <select
            className="mt-2 h-10 w-full rounded-2xl border border-gray-200 bg-white px-3 text-[13px] text-slate-900"
            value={draftOptionId}
            onChange={(event) => setDraftOptionId(event.target.value)}
            disabled={props.drafts.length === 0}
          >
            {props.drafts.length === 0 ? (
              <option value="">{worldStudioMessage('workflow.noDraftOption', 'No draft yet')}</option>
            ) : props.drafts.map((draft) => (
              <option key={draft.id} value={draft.id}>
                {draft.id}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-[11px] text-slate-500">
            {worldStudioMessage('workflow.draftStatus', 'Status: {{status}}', { status: selectedDraft?.status || '-' })}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="ui-sync-btn ui-sync-btn-primary inline-flex h-8 items-center rounded-2xl px-3.5 text-[12px] font-semibold text-white"
              onClick={() => props.onOpenCreate(null)}
            >
              {worldStudioMessage('workflow.newDraft', 'New draft')}
            </button>
            <button
              type="button"
              className="inline-flex h-8 items-center rounded-2xl border border-gray-200 bg-white px-3.5 text-[12px] font-semibold text-slate-700 shadow-sm disabled:opacity-60"
              disabled={!selectedDraft}
              onClick={() => props.onOpenCreate(selectedDraft?.id || null)}
            >
              {worldStudioMessage('workflow.continueDraft', 'Continue draft')}
            </button>
          </div>
        </article>
      </div>
    </section>
  );
}
