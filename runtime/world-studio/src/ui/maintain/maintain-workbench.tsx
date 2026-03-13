import React from 'react';
import { WorldBasePanel } from './world-base-panel.js';
import { WorldviewPanel } from './worldview-panel.js';
import { EventsPanel } from './events-panel.js';
import { LorebooksPanel } from './lorebooks-panel.js';
import { StickyActionBar } from '../sticky-action-bar.js';
import type {
  WorldStudioActionsSlice,
  WorldStudioLayoutSlice,
  WorldStudioMainSlice,
  WorldStudioStatusSlice,
  WorldStudioWorkflowSlice,
} from '../../controllers/world-studio-screen-model.js';
import { useModTranslation } from "@nimiplatform/sdk/mod";

type MaintainWorkbenchProps = {
  layout: WorldStudioLayoutSlice;
  workflow: WorldStudioWorkflowSlice;
  main: WorldStudioMainSlice;
  status: WorldStudioStatusSlice;
  actions: WorldStudioActionsSlice;
};

function ConflictBanner(props: {
  status: WorldStudioStatusSlice;
  actions: WorldStudioActionsSlice['maintain'];
  working: boolean;
}): React.ReactElement | null {
  const { t } = useModTranslation('world-studio');
  if (!props.status.hasMaintenanceConflict) {
    return null;
  }
  return (
    <div className="rounded-[24px] border border-amber-200 bg-amber-50/92 p-4 text-amber-900 shadow-[0_10px_24px_rgba(245,158,11,0.12)]">
      <p className="text-sm font-semibold">{t('maintain.conflictTitle', 'Remote maintenance conflict')}</p>
      <p className="mt-1 text-xs">
        {t('maintain.conflictBody', 'The remote world changed after this snapshot was loaded. Resolve the conflict before trusting local edits.')}
      </p>
      <p className="mt-2 text-xs">
        {t('maintain.conflictSnapshot', 'Remote snapshot: {{value}}', {
          value: props.status.maintenanceEditorSnapshotVersion || '-',
        })}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900"
          onClick={() => {
            void props.actions.reloadRemote();
          }}
        >
          {t('maintain.reloadRemoteSnapshot', 'Reload Remote Snapshot')}
        </button>
        <button
          type="button"
          className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900"
          onClick={props.actions.adoptRemoteSnapshot}
        >
          {t('maintain.adoptRemoteSnapshot', 'Adopt Remote Snapshot')}
        </button>
        <button
          type="button"
          className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-60"
          onClick={() => {
            void props.actions.saveMaintenance({ force: true });
          }}
          disabled={props.working}
        >
          {t('maintain.forceSave', 'Force Save')}
        </button>
        <button
          type="button"
          className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-60"
          onClick={() => {
            void props.actions.syncEvents({ force: true });
          }}
          disabled={props.working}
        >
          {t('maintain.forceSyncEvents', 'Force Sync Events')}
        </button>
      </div>
    </div>
  );
}

function MaintainObjectHeader(props: MaintainWorkbenchProps): React.ReactElement {
  const { t } = useModTranslation('world-studio');
  const worldName = String(props.main.snapshot.worldPatch.name || '').trim();
  const missingEvidenceCount = props.status.missingPrimaryEvidenceCount;
  return (
    <section className="rounded-[28px] border border-white/80 bg-white/88 p-5 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            {t('maintain.headerLabel', 'Maintenance')}
          </p>
          <h3 className="mt-1 text-lg font-semibold text-gray-900">
            {worldName || props.workflow.selectedWorldId || t('maintain.untitledWorld', 'Untitled world')}
          </h3>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-600">
            <span>{t('maintain.worldId', 'World ID: {{value}}', { value: props.workflow.selectedWorldId || '-' })}</span>
            <span>{t('maintain.snapshotVersion', 'Snapshot: {{value}}', { value: props.status.maintenanceEditorSnapshotVersion || '-' })}</span>
          </div>
        </div>
        <div className="rounded-full border border-white/80 bg-[#eef5f5] px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
          {props.layout.dirtySummary.shortLabel}
        </div>
      </div>
      {props.layout.dirtySummary.hasDirty ? (
        <p className="mt-3 text-xs text-amber-700">
          {t('maintain.unsavedPanels', 'Unsaved panels: {{value}}', {
            value: props.layout.dirtySummary.labels.join(', '),
          })}
        </p>
      ) : (
        <p className="mt-3 text-xs text-emerald-700">
          {t('maintain.savedState', 'Local edits are synced with the current snapshot.')}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-full bg-[#eef5f5] px-3 py-1 text-xs font-medium text-slate-600">
          {t('studioStatus.primary', 'Primary')} {props.status.primaryEventCount}
        </span>
        <span className="rounded-full bg-[#eef5f5] px-3 py-1 text-xs font-medium text-slate-600">
          {t('studioStatus.secondary', 'Secondary')} {props.status.secondaryEventCount}
        </span>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            missingEvidenceCount > 0
              ? 'bg-[#fff4e8] text-amber-700'
              : 'bg-[#eef5f5] text-slate-600'
          }`}
        >
          {t('studioStatus.missingPrimaryEvidence', 'Missing evidence')} {missingEvidenceCount}
        </span>
      </div>
    </section>
  );
}

export function MaintainWorkbench(props: MaintainWorkbenchProps) {
  const section = props.workflow.maintainSection;
  const { t } = useModTranslation('world-studio');

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-auto px-5 py-5">
        <div className="space-y-4">
          <MaintainObjectHeader {...props} />
          <ConflictBanner status={props.status} actions={props.actions.maintain} working={props.main.working} />

          <section className="rounded-[24px] border border-white/80 bg-white/82 p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              {t('maintain.currentSection', 'Current section')}
            </p>
            <p className="mt-2 text-lg font-semibold text-slate-900">{section}</p>
          </section>

          {section === 'WORLD' ? (
            <WorldBasePanel
              worldPatch={props.main.snapshot.worldPatch}
              onWorldPatchChange={props.actions.maintain.onWorldPatchChange}
            />
          ) : null}

          {section === 'WORLDVIEW' ? (
            <WorldviewPanel
              worldviewPatch={props.main.snapshot.worldviewPatch}
              onWorldviewPatchChange={props.actions.maintain.onWorldviewPatchChange}
            />
          ) : null}

          {section === 'EVENTS' ? (
            <EventsPanel
              events={props.main.eventsGraph}
              syncMode={props.main.eventSyncMode}
              editorSnapshotVersion={props.status.maintenanceEditorSnapshotVersion}
              eventGraphLayout={props.main.snapshot.eventGraphLayout}
              working={props.main.working}
              onEventsChange={props.actions.maintain.onEventsChange}
              onEventGraphLayoutChange={props.actions.maintain.onEventGraphLayoutChange}
              onSyncModeChange={props.actions.maintain.onEventSyncModeChange}
              onSyncEvents={() => {
                void props.actions.maintain.syncEvents();
              }}
              onDeleteFirstEvent={() => undefined}
              showActions={false}
            />
          ) : null}

          {section === 'LOREBOOKS' ? (
            <LorebooksPanel
              lorebooksDraft={props.main.snapshot.lorebooksDraft}
              working={props.main.working}
              onLorebooksChange={props.actions.maintain.onLorebooksChange}
              onSyncLorebooks={() => {
                void props.actions.maintain.syncLorebooks();
              }}
              onDeleteFirstLorebook={() => undefined}
              showActions={false}
            />
          ) : null}
        </div>
      </div>

      <StickyActionBar>
        <button
          type="button"
          className="ui-sync-btn ui-sync-btn-primary rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          onClick={() => {
            void props.actions.maintain.saveMaintenance();
          }}
          disabled={props.main.working || !props.workflow.selectedWorldId}
        >
          {t('maintain.save', 'Save')}
        </button>
        <button
          type="button"
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 disabled:opacity-60"
          onClick={() => {
            void props.actions.maintain.syncEvents();
          }}
          disabled={props.main.working || !props.workflow.selectedWorldId}
        >
          {t('maintain.syncEvents', 'Sync Events')}
        </button>
        <button
          type="button"
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 disabled:opacity-60"
          onClick={() => {
            void props.actions.maintain.syncLorebooks();
          }}
          disabled={props.main.working || !props.workflow.selectedWorldId}
        >
          {t('maintain.syncLorebooks', 'Sync Lorebooks')}
        </button>
        <button
          type="button"
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700"
          onClick={() => {
            void props.actions.maintain.refreshResources();
          }}
        >
          {t('maintain.reloadRemote', 'Refresh Remote')}
        </button>
      </StickyActionBar>
    </div>
  );
}
