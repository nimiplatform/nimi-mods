import React, { useEffect, useMemo, useState } from 'react';
import type { WorldDraftSummary, WorldSummary } from '../ui/types.js';
import { useModTranslation } from "@nimiplatform/sdk/mod";
function resolveSelectedId<T extends {
    id: string;
}>(items: T[], preferredId: string): string {
    if (preferredId && items.some((item) => item.id === preferredId))
        return preferredId;
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
    const { t } = useModTranslation('world-studio');
    const { worlds, drafts, primaryWorld, latestDraft, selectedWorldId, selectedDraftId, onRefresh, onOpenMaintenance, onOpenCreate, } = props;
    const [worldOptionId, setWorldOptionId] = useState(() => resolveSelectedId(worlds, selectedWorldId));
    const [draftOptionId, setDraftOptionId] = useState(() => resolveSelectedId(drafts, selectedDraftId));
    useEffect(() => {
        setWorldOptionId((current) => {
            if (current && worlds.some((item) => item.id === current))
                return current;
            return resolveSelectedId(worlds, selectedWorldId);
        });
    }, [worlds, selectedWorldId]);
    useEffect(() => {
        setDraftOptionId((current) => {
            if (current && drafts.some((item) => item.id === current))
                return current;
            return resolveSelectedId(drafts, selectedDraftId);
        });
    }, [drafts, selectedDraftId]);
    const selectedWorld = useMemo(() => worlds.find((item) => item.id === worldOptionId) || null, [worldOptionId, worlds]);
    const selectedDraft = useMemo(() => drafts.find((item) => item.id === draftOptionId) || null, [draftOptionId, drafts]);
    return (<div className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 px-4">
        <h3 className="text-lg font-semibold text-gray-900">{t('workspace.title')}</h3>
        <button type="button" onClick={onRefresh} className="ui-sync-btn ui-sync-btn-secondary rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700">
          {t('workspace.refresh')}
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
        <section className="ui-sync-card ui-sync-card-inset rounded-xl border border-gray-200 bg-white p-3">
          <h4 className="text-sm font-semibold text-gray-900">{t('workspace.worldCardTitle')}</h4>
          {selectedWorld ? (<>
              <p className="mt-1 text-xs font-semibold text-emerald-700">{t('workspace.publishedWorld')}</p>
              <label className="mt-2 block text-[11px] text-gray-500">{t('workspace.worldSelectorLabel')}</label>
              <select className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-800" value={worldOptionId} onChange={(event) => setWorldOptionId(event.target.value)}>
                {worlds.map((world) => (<option key={world.id} value={world.id}>
                    {world.name}
                  </option>))}
              </select>
              <p className="mt-2 truncate text-[11px] text-gray-500">{selectedWorld.id}</p>
            </>) : (<p className="mt-2 text-xs text-gray-500">{t('workspace.noPublishedWorld')}</p>)}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="ui-sync-btn ui-sync-btn-secondary rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => {
            if (selectedWorld)
                onOpenMaintenance(selectedWorld.id);
        }} disabled={!selectedWorld}>
              {t('workspace.openMaintenance')}
            </button>
          </div>
        </section>

        <section className="ui-sync-card ui-sync-card-inset rounded-xl border border-gray-200 bg-white p-3">
          <h4 className="text-sm font-semibold text-gray-900">{t('workspace.draftCardTitle')}</h4>
          <p className="mt-1 text-xs font-semibold text-amber-700">{t('workspace.draftPrePublish')}</p>
          {selectedDraft ? (<>
              <label className="mt-2 block text-[11px] text-gray-500">{t('workspace.draftSelectorLabel')}</label>
              <select className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-800" value={draftOptionId} onChange={(event) => setDraftOptionId(event.target.value)}>
                {drafts.map((draft) => (<option key={draft.id} value={draft.id}>
                    {draft.id}
                  </option>))}
              </select>
              <p className="mt-2 truncate text-[11px] text-gray-700">{selectedDraft.id}</p>
              <p className="mt-1 text-[11px] text-gray-500">{t('workspace.statusLabel')}: {selectedDraft.status}</p>
            </>) : (<p className="mt-2 text-xs text-gray-500">{t('workspace.noDraft')}</p>)}

          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="ui-sync-btn ui-sync-btn-primary rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700" onClick={() => onOpenCreate(null)}>
              {t('workspace.startDraft')}
            </button>
            <button type="button" className="ui-sync-btn ui-sync-btn-secondary rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => onOpenCreate(selectedDraft?.id || null)} disabled={!selectedDraft}>
              {t('workspace.continueDraft')}
            </button>
          </div>
        </section>
      </div>
    </div>);
}
