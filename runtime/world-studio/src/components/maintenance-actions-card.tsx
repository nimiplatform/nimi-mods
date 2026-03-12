import React from 'react';
import { useModTranslation } from "@nimiplatform/sdk/mod";
type MaintenanceActionsCardProps = {
    selectedWorldId: string;
    editorSnapshotVersion: string;
    eventSyncMode: 'merge' | 'replace';
    working: boolean;
    hasMaintenanceConflict: boolean;
    remoteMaintenanceSnapshotVersion: string;
    onSaveMaintenance: (payload?: {
        force?: boolean;
    }) => void;
    onSyncEvents: (payload?: {
        force?: boolean;
    }) => void;
    onSyncLorebooks: () => void;
    onRefreshResources: () => void;
    onReloadRemoteForConflict: () => void;
    onAdoptRemoteSnapshot: () => void;
    embedded?: boolean;
    showTitle?: boolean;
};
export function MaintenanceActionsCard(props: MaintenanceActionsCardProps) {
    const { t } = useModTranslation('world-studio');
    const embedded = Boolean(props.embedded);
    const showTitle = props.showTitle !== false;
    return (<section className={embedded ? '' : 'ui-sync-card ui-sync-card-inset p-3'}>
      {showTitle ? <h4 className="text-sm font-semibold text-gray-900">{t('maintenanceActions.title')}</h4> : null}
      <p className={`${showTitle ? 'mt-1 ' : ''}text-xs text-gray-600`}>{t('maintenanceActions.worldId')}: {props.selectedWorldId || '-'}</p>
      <p className="mt-1 text-xs text-gray-600">{t('maintenanceActions.snapshot')}: {props.editorSnapshotVersion || '-'}</p>
      <p className="mt-1 text-xs text-gray-600">{t('maintenanceActions.eventSyncMode')}: {props.eventSyncMode}</p>
      <div className="mt-3 flex flex-col gap-2">
        <button type="button" className="ui-sync-btn ui-sync-btn-primary rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60" onClick={() => props.onSaveMaintenance()} disabled={!props.selectedWorldId || props.working}>
          {t('maintenanceActions.save')}
        </button>
        <button type="button" className="ui-sync-btn ui-sync-btn-primary rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60" onClick={() => props.onSyncEvents()} disabled={!props.selectedWorldId || props.working}>
          {t('maintenanceActions.syncEvents')}
        </button>
        <button type="button" className="ui-sync-btn ui-sync-btn-primary rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60" onClick={props.onSyncLorebooks} disabled={!props.selectedWorldId || props.working}>
          {t('maintenanceActions.syncLorebooks')}
        </button>
        <button type="button" className="ui-sync-btn ui-sync-btn-secondary rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700" onClick={props.onRefreshResources}>
          {t('maintenanceActions.refresh')}
        </button>
      </div>
      {props.hasMaintenanceConflict ? (<div className="ui-sync-alert ui-sync-alert-warning mt-3 p-2">
          <p className="text-[11px] font-semibold text-amber-800">{t('maintenanceActions.conflictActions')}</p>
          <p className="mt-1 text-[11px] text-amber-800">
            {t('maintenanceActions.remoteSnapshot')}: {props.remoteMaintenanceSnapshotVersion || '-'}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="ui-sync-btn rounded-md border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-800" onClick={props.onReloadRemoteForConflict}>
              {t('maintenanceActions.reloadRemote')}
            </button>
            <button type="button" className="ui-sync-btn rounded-md border border-red-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-red-700 disabled:opacity-60" onClick={() => props.onSaveMaintenance({ force: true })} disabled={!props.selectedWorldId || props.working}>
              {t('maintenanceActions.forceSave')}
            </button>
            <button type="button" className="ui-sync-btn rounded-md border border-red-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-red-700 disabled:opacity-60" onClick={() => props.onSyncEvents({ force: true })} disabled={!props.selectedWorldId || props.working}>
              {t('maintenanceActions.forceSyncEvents')}
            </button>
            <button type="button" className="ui-sync-btn rounded-md border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-800" onClick={props.onAdoptRemoteSnapshot}>
              {t('maintenanceActions.adoptRemote')}
            </button>
          </div>
        </div>) : null}
    </section>);
}
