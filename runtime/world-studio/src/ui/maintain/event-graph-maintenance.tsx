import React from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import type { EventNodeDraft } from '../../contracts.js';
import { countPrimaryEventsMissingEvidence } from '../../services/event-horizon.js';
import { EventGraphEditor } from '../create/event-graph-editor.js';

type EventGraphMaintenanceProps = {
  events: {
    primary: EventNodeDraft[];
    secondary: EventNodeDraft[];
  };
  syncMode: 'merge' | 'replace';
  editorSnapshotVersion?: string;
  layout?: {
    selectedEventId: string;
    expandedPrimaryIds: string[];
  };
  working: boolean;
  onEventsChange: (next: { primary: EventNodeDraft[]; secondary: EventNodeDraft[] }) => void;
  onLayoutChange?: (next: { selectedEventId: string; expandedPrimaryIds: string[] }) => void;
  onSyncModeChange: (mode: 'merge' | 'replace') => void;
  onSyncEvents: () => void;
  onDeleteFirstEvent: () => void;
};

export function EventGraphMaintenance(props: EventGraphMaintenanceProps) {
  const { t } = useModTranslation('world-studio');
  const totalEvents = props.events.primary.length + props.events.secondary.length;
  const missingPrimaryEvidence = countPrimaryEventsMissingEvidence(props.events.primary);
  const primaryIds = new Set(props.events.primary.map((item) => String(item.id || '').trim()).filter(Boolean));
  const orphanSecondary = props.events.secondary.filter((item) => {
    const parentId = String(item.parentEventId || '').trim();
    return !parentId || !primaryIds.has(parentId);
  }).length;

  return (
    <div className="space-y-3">
      <EventGraphEditor
        title={t('eventGraphMaintenance.title')}
        events={props.events}
        onChange={props.onEventsChange}
        layout={props.layout}
        onLayoutChange={props.onLayoutChange}
      />

      <section className="ui-sync-card ui-sync-card-inset p-4">
        <div className="ui-sync-toolbar mb-3 px-3 py-2 text-xs text-gray-700">
          <p>{t('eventGraphMaintenance.snapshot', { value: props.editorSnapshotVersion || '-' })}</p>
          <p>{t('eventGraphMaintenance.eventSummary', {
            total: totalEvents,
            primary: props.events.primary.length,
            secondary: props.events.secondary.length,
          })}</p>
          <p>{t('eventGraphMaintenance.evidenceSummary', {
            missing: missingPrimaryEvidence,
            orphan: orphanSecondary,
          })}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-[220px_1fr]">
          <label className="text-xs text-gray-700">
            <span className="mb-1 block font-medium">{t('eventGraphMaintenance.bulkSyncMode')}</span>
            <select
              className="h-9 w-full rounded-md border border-gray-300 px-2 text-xs"
              value={props.syncMode}
              onChange={(event) => props.onSyncModeChange(
                event.target.value === 'replace' ? 'replace' : 'merge',
              )}
            >
              <option value="merge">{t('eventGraphMaintenance.mergeLabel')}</option>
              <option value="replace">{t('eventGraphMaintenance.replaceLabel')}</option>
            </select>
          </label>
          <div className="ui-sync-soft-card px-3 py-2 text-xs text-gray-600">
            {t('eventGraphMaintenance.modeHint')}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="ui-sync-btn ui-sync-btn-primary rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
            onClick={props.onSyncEvents}
            disabled={props.working}
          >
            {t('eventGraphMaintenance.syncEvents', { mode: props.syncMode })}
          </button>
          <button
            type="button"
            className="ui-sync-btn ui-sync-btn-secondary rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 disabled:opacity-60"
            onClick={props.onDeleteFirstEvent}
            disabled={props.working}
          >
            {t('eventGraphMaintenance.deleteFirstEvent')}
          </button>
        </div>
      </section>
    </div>
  );
}
