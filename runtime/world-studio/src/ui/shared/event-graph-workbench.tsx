import React, { useEffect, useMemo, useState } from 'react';
import type { EventNodeDraft } from '../../contracts.js';
import { countPrimaryEventsMissingEvidence, isEvidenceRequiredForEvent } from '../../services/event-horizon.js';
import { EventDetailDrawer } from '../create/event-detail-drawer.js';
import { buildDiagnosticsSummary, detectDependencyDiagnostics } from '../create/event-graph/diagnostics.js';
import { createEventGraphActions } from '../create/event-graph/editor-actions.js';
import { EventGraphEditorHeader } from '../create/event-graph/editor-header.js';
import {
  resolveActivePrimaryId,
  resolveExpandedPrimaryIds,
  resolveSelectedEventId,
} from '../create/event-graph/layout.js';
import { normalizeGraph } from '../create/event-graph/state.js';
import { useModTranslation } from "@nimiplatform/sdk/mod";

type EventGraphSyncConfig = {
  mode: 'merge' | 'replace';
  snapshotVersion?: string;
  showActions?: boolean;
  working?: boolean;
  onModeChange: (mode: 'merge' | 'replace') => void;
  onSync: () => void;
};

export type EventGraphWorkbenchProps = {
  title: string;
  events: {
    primary: EventNodeDraft[];
    secondary: EventNodeDraft[];
  };
  layout?: {
    selectedEventId: string;
    expandedPrimaryIds: string[];
  };
  readonly?: boolean;
  sourceContextText?: string;
  onEventsChange: (next: { primary: EventNodeDraft[]; secondary: EventNodeDraft[] }) => void;
  onLayoutChange?: (next: { selectedEventId: string; expandedPrimaryIds: string[] }) => void;
  sync?: EventGraphSyncConfig;
};

export function resolveEventWorkbenchSelection(input: {
  graph: {
    primary: EventNodeDraft[];
    secondary: EventNodeDraft[];
  };
  selectedEventId: string;
}): {
  selectedPrimary: EventNodeDraft | null;
  selectedSecondary: EventNodeDraft | null;
  selected: EventNodeDraft | null;
  activePrimaryId: string;
} {
  const selectedPrimary = input.graph.primary.find((item) => item.id === input.selectedEventId) || null;
  const selectedSecondary = input.graph.secondary.find((item) => item.id === input.selectedEventId) || null;
  const selected = selectedPrimary
    || selectedSecondary
    || input.graph.primary[0]
    || input.graph.secondary[0]
    || null;

  return {
    selectedPrimary,
    selectedSecondary,
    selected,
    activePrimaryId: resolveActivePrimaryId({
      selectedPrimaryId: selectedPrimary?.id || (selected?.level === 'PRIMARY' ? selected.id : null),
      selectedSecondaryParentId: selectedSecondary?.parentEventId || (selected?.level === 'SECONDARY' ? selected.parentEventId || null : null),
      graphPrimary: input.graph.primary,
    }),
  };
}

type EditorMode = 'overview' | 'focus';

function EventListColumn(props: {
  title: string;
  emptyText: string;
  items: EventNodeDraft[];
  selectedEventId: string;
  readonly?: boolean;
  onMove?: (eventId: string, direction: 'up' | 'down') => void;
  onSelect: (eventId: string) => void;
  secondaryCountByPrimary?: Map<string, number>;
  evidenceCountOnly?: boolean;
}) {
  const { t } = useModTranslation('world-studio');

  return (
    <div className="ui-sync-soft-card p-2.5">
      <p className="text-xs font-semibold text-gray-700">{props.title}</p>
      <div className="mt-2 max-h-[440px] space-y-2 overflow-auto">
        {props.items.length === 0 ? (
          <p className="text-[11px] text-gray-500">{props.emptyText}</p>
        ) : props.items.map((event, index) => {
          const isSelected = props.selectedEventId === event.id;
          return (
            <div
              key={`event-${event.id}`}
              className={`ui-sync-node-card w-full px-2 py-1.5 text-left ${
                isSelected
                  ? 'ui-sync-node-card-selected border-brand-300 bg-brand-50'
                  : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex items-center gap-2">
                {!props.readonly && props.onMove ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="ui-sync-btn ui-sync-btn-secondary rounded border border-gray-300 bg-white px-1 py-0.5 text-[10px] font-semibold text-gray-600 disabled:opacity-40"
                      onClick={() => props.onMove?.(event.id, 'up')}
                      disabled={index === 0}
                      title={t('eventGraphEditor.moveUp')}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="ui-sync-btn ui-sync-btn-secondary rounded border border-gray-300 bg-white px-1 py-0.5 text-[10px] font-semibold text-gray-600 disabled:opacity-40"
                      onClick={() => props.onMove?.(event.id, 'down')}
                      disabled={index === props.items.length - 1}
                      title={t('eventGraphEditor.moveDown')}
                    >
                      ↓
                    </button>
                  </div>
                ) : null}

                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => props.onSelect(event.id)}>
                  <p className="truncate text-xs font-semibold text-gray-900">{event.title || event.id}</p>
                  <p className="mt-0.5 text-[11px] text-gray-500">
                    {props.evidenceCountOnly
                      ? t('eventGraphEditor.evidenceCount', { count: event.evidenceRefs.length })
                      : `${t('eventGraphEditor.secondaryCount', {
                          count: props.secondaryCountByPrimary?.get(event.id) || 0,
                        })} · ${t('eventGraphEditor.evidenceCount', { count: event.evidenceRefs.length })}`}
                  </p>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventSelectedStat(props: {
  label: string;
  value: string;
  tone?: 'default' | 'warn' | 'ok';
}) {
  const toneClass = props.tone === 'warn'
    ? 'text-amber-700'
    : props.tone === 'ok'
      ? 'text-emerald-700'
      : 'text-slate-700';

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{props.label}</p>
      <p className={`mt-1 text-sm font-semibold ${toneClass}`}>{props.value}</p>
    </div>
  );
}

function EventGraphSyncSummary(props: {
  sync: EventGraphSyncConfig;
  mode: EditorMode;
  primaryCount: number;
  secondaryCount: number;
  missingEvidencePrimaryCount: number;
  orphanSecondaryCount: number;
}) {
  const { t } = useModTranslation('world-studio');
  const totalEvents = props.primaryCount + props.secondaryCount;
  const showActions = props.sync.showActions !== false;

  return (
    <section className="rounded-xl border border-white/80 bg-white/92 p-3 shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 text-xs text-gray-700">
          <p>{t('eventGraphMaintenance.snapshot', { value: props.sync.snapshotVersion || '-' })}</p>
          <p>{t('eventGraphMaintenance.eventSummary', {
            total: totalEvents,
            primary: props.primaryCount,
            secondary: props.secondaryCount,
          })}</p>
          <p>{t('eventGraphMaintenance.evidenceSummary', {
            missing: props.missingEvidencePrimaryCount,
            orphan: props.orphanSecondaryCount,
          })}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
            props.mode === 'focus'
              ? 'border-slate-200 bg-slate-900 text-white'
              : 'border-teal-200 bg-teal-50 text-teal-700'
          }`}>
            {props.mode === 'focus'
              ? t('eventGraphMaintenance.focusLabel', 'Focus edit')
              : t('eventGraphMaintenance.inspectLabel', 'Inspect')}
          </span>
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[220px_1fr]">
        <label className="text-xs text-gray-700">
          <span className="mb-1 block font-medium">{t('eventGraphMaintenance.bulkSyncMode')}</span>
          <select
            className="h-9 w-full rounded-md border border-gray-300 px-2 text-xs"
            value={props.sync.mode}
            onChange={(event) => props.sync.onModeChange(event.target.value === 'replace' ? 'replace' : 'merge')}
          >
            <option value="merge">{t('eventGraphMaintenance.mergeLabel')}</option>
            <option value="replace">{t('eventGraphMaintenance.replaceLabel')}</option>
          </select>
        </label>
        <div className="ui-sync-soft-card px-3 py-2 text-xs text-gray-600">
          {t('eventGraphMaintenance.modeHint')}
        </div>
      </div>

      {showActions ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="ui-sync-btn ui-sync-btn-primary rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
            onClick={props.sync.onSync}
            disabled={props.sync.working}
          >
            {t('eventGraphMaintenance.syncEvents', { mode: props.sync.mode })}
          </button>
        </div>
      ) : null}
    </section>
  );
}

export function EventGraphWorkbench(props: EventGraphWorkbenchProps) {
  const { t } = useModTranslation('world-studio');
  const [mode, setMode] = useState<EditorMode>('overview');

  const graph = useMemo(() => normalizeGraph(props.events), [props.events]);
  const expandedPrimaryIds = useMemo(() => {
    return resolveExpandedPrimaryIds({
      graphPrimary: graph.primary,
      expandedPrimaryIds: props.layout?.expandedPrimaryIds,
    });
  }, [graph.primary, props.layout?.expandedPrimaryIds]);
  const selectedEventId = resolveSelectedEventId({
    selectedEventId: props.layout?.selectedEventId,
    graphPrimary: graph.primary,
    graphSecondary: graph.secondary,
  });
  const {
    selectedPrimary,
    selectedSecondary,
    selected,
    activePrimaryId,
  } = resolveEventWorkbenchSelection({
    graph,
    selectedEventId,
  });
  const secondaryForPrimary = graph.secondary.filter((item) => item.parentEventId === activePrimaryId);
  const missingEvidencePrimaryCount = countPrimaryEventsMissingEvidence(graph.primary);
  const dependencyDiagnostics = useMemo(() => detectDependencyDiagnostics(graph), [graph]);
  const diagnosticsSummary = useMemo(() => buildDiagnosticsSummary({
    missingDependencyCount: dependencyDiagnostics.missingDependencyRefs.length,
    selfReferenceCount: dependencyDiagnostics.selfReferenceIds.length,
    cycleNodeCount: dependencyDiagnostics.cycleNodeIds.length,
    orphanSecondaryCount: dependencyDiagnostics.orphanSecondaryIds.length,
    missingEvidencePrimaryCount,
  }), [dependencyDiagnostics, missingEvidencePrimaryCount]);
  const secondaryCountByPrimary = useMemo(() => {
    const result = new Map<string, number>();
    graph.secondary.forEach((item) => {
      const parentId = String(item.parentEventId || '').trim();
      if (!parentId) return;
      result.set(parentId, (result.get(parentId) || 0) + 1);
    });
    return result;
  }, [graph.secondary]);
  const selectedMissingDependencyCount = selected
    ? dependencyDiagnostics.missingDependencyRefs.filter((item) => item.eventId === selected.id).length
    : 0;
  const selectedHasSelfReference = selected
    ? dependencyDiagnostics.selfReferenceIds.includes(selected.id)
    : false;
  const selectedInCycle = selected
    ? dependencyDiagnostics.cycleNodeIds.includes(selected.id)
    : false;
  const selectedIsOrphanSecondary = selected?.level === 'SECONDARY'
    ? dependencyDiagnostics.orphanSecondaryIds.includes(selected.id)
    : false;
  const selectedParentTitle = selected?.level === 'SECONDARY'
    ? graph.primary.find((item) => item.id === selected.parentEventId)?.title || selected.parentEventId || ''
    : '';
  const selectedSummary = String(selected?.summary || '').trim();
  const selectedRequiresEvidence = selected ? isEvidenceRequiredForEvent(selected) : false;
  const selectedSecondaryCount = selected?.level === 'PRIMARY'
    ? secondaryCountByPrimary.get(selected.id) || 0
    : 0;

  const emitGraph = (next: { primary: EventNodeDraft[]; secondary: EventNodeDraft[] }) => {
    props.onEventsChange(normalizeGraph(next));
  };
  const handlers = createEventGraphActions({
    graph,
    selectedEventId,
    expandedPrimaryIds,
    activePrimaryId,
    selected,
    emitGraph,
    onLayoutChange: props.onLayoutChange,
  });

  useEffect(() => {
    if (!selected) {
      setMode('overview');
    }
  }, [selected]);

  const openInspectForEvent = (eventId: string) => {
    handlers.setSelected(eventId);
    setMode('overview');
  };

  const canvasLists = (
    <div className="grid gap-3 xl:grid-cols-[300px_300px_minmax(0,1fr)]">
      <EventListColumn
        title={t('eventGraphEditor.primaryEvents')}
        emptyText={t('eventGraphEditor.noPrimaryEvents')}
        items={graph.primary}
        selectedEventId={selectedEventId}
        readonly={props.readonly}
        onMove={handlers.movePrimary}
        onSelect={openInspectForEvent}
        secondaryCountByPrimary={secondaryCountByPrimary}
      />

      <EventListColumn
        title={t('eventGraphEditor.secondaryEvents')}
        emptyText={t('eventGraphEditor.noSecondaryEventsForParent')}
        items={secondaryForPrimary}
        selectedEventId={selectedEventId}
        readonly={props.readonly}
        onMove={(eventId, direction) => handlers.moveSecondary(eventId, activePrimaryId, direction)}
        onSelect={openInspectForEvent}
        evidenceCountOnly
      />

      <div className="rounded-xl border border-white/80 bg-white/92 p-3 shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              {t('eventGraphEditor.selected')}
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {selected?.title || t('eventGraphEditor.selectEventToEdit')}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {selected
                ? `${selected.level} · ${selected.eventHorizon}`
                : props.sync
                  ? t('eventGraphMaintenance.modeHint')
                  : t('eventGraphEditor.selectEventToEdit')}
            </p>
          </div>
          {selected ? (
            <button
              type="button"
              className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-slate-900 bg-slate-900 px-2.5 py-1 text-[10px] font-semibold text-white"
              onClick={() => {
                setMode('focus');
              }}
            >
              {t('eventGraphMaintenance.openFocus', 'Open Focus Editor')}
            </button>
          ) : null}
        </div>
        {selected ? (
          <div className="mt-3 space-y-3">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <EventSelectedStat
                label={t('eventGraphEditor.evidenceLabel', 'Evidence')}
                value={String(selected.evidenceRefs.length)}
                tone={selectedRequiresEvidence && selected.evidenceRefs.length === 0 ? 'warn' : 'default'}
              />
              <EventSelectedStat
                label={t('eventGraphEditor.dependencyLabel', 'Dependencies')}
                value={String(selected.dependsOnEventIds.length)}
                tone={selectedMissingDependencyCount > 0 ? 'warn' : 'default'}
              />
              <EventSelectedStat
                label={t('eventGraphEditor.characterRefsLabel', 'Characters')}
                value={String(selected.characterRefs.length)}
              />
              <EventSelectedStat
                label={t('eventGraphEditor.locationRefsLabel', 'Locations')}
                value={String(selected.locationRefs.length)}
              />
            </div>

            <div className="flex flex-wrap gap-2 text-[11px]">
              {selected.level === 'SECONDARY' ? (
                <span className={`rounded-full border px-2.5 py-1 font-medium ${
                  selectedIsOrphanSecondary
                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                    : 'border-slate-200 bg-slate-50 text-slate-600'
                }`}>
                  {selectedParentTitle
                    ? t('eventGraphEditor.parentEvent', { value: selectedParentTitle })
                    : t('eventGraphEditor.parentEventMissing', 'Parent event missing')}
                </span>
              ) : (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-600">
                  {t('eventGraphEditor.selectedSecondaryCount', { count: selectedSecondaryCount })}
                </span>
              )}
              <span className={`rounded-full border px-2.5 py-1 font-medium ${
                selectedMissingDependencyCount > 0
                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700'
              }`}>
                {selectedMissingDependencyCount > 0
                  ? t('eventGraphEditor.selectedMissingDeps', { count: selectedMissingDependencyCount })
                  : t('eventGraphEditor.selectedDepsHealthy', 'Dependencies healthy')}
              </span>
              {selectedHasSelfReference ? (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-medium text-amber-700">
                  {t('eventGraphEditor.selectedSelfRef', 'Contains self reference')}
                </span>
              ) : null}
              {selectedInCycle ? (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-medium text-amber-700">
                  {t('eventGraphEditor.selectedCycle', 'Participates in a cycle')}
                </span>
              ) : null}
              {selectedRequiresEvidence ? (
                <span className={`rounded-full border px-2.5 py-1 font-medium ${
                  selected.evidenceRefs.length === 0
                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                }`}>
                  {selected.evidenceRefs.length === 0
                    ? t('eventGraphEditor.selectedMissingEvidence', 'Primary evidence missing')
                    : t('eventGraphEditor.selectedEvidenceReady', 'Primary evidence ready')}
                </span>
              ) : null}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                {t('eventGraphEditor.summaryLabel', 'Summary')}
              </p>
              <p className="mt-1 text-xs leading-6 text-slate-600">
                {selectedSummary || t('eventGraphEditor.summaryEmpty', 'No summary yet. Enter focus edit to add event context, cause, process, and result.')}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <section className="relative space-y-3">
      <div className="rounded-[24px] border border-white/80 bg-white/88 p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
        <EventGraphEditorHeader
          title={props.title}
          readonly={props.readonly}
          primaryCount={graph.primary.length}
          secondaryCount={graph.secondary.length}
          missingEvidencePrimaryCount={missingEvidencePrimaryCount}
          selectedTitle={selected?.title || ''}
          canAddSecondary={Boolean(activePrimaryId)}
          canRepairSecondaryParents={dependencyDiagnostics.orphanSecondaryIds.length > 0 && graph.primary.length > 0}
          canPruneInvalidDependencies={
            dependencyDiagnostics.missingDependencyRefs.length > 0
            || dependencyDiagnostics.selfReferenceIds.length > 0
            || dependencyDiagnostics.cycleNodeIds.length > 0
          }
          diagnosticsHasIssues={diagnosticsSummary.hasIssues}
          diagnosticsIssueLines={diagnosticsSummary.issueLines}
          missingDependencySample={dependencyDiagnostics.missingDependencyRefs[0] || null}
          onAddPrimary={handlers.handleAddPrimary}
          onAddSecondary={handlers.handleAddSecondary}
          onApplyEvidenceTemplate={handlers.applyEvidenceTemplateForMissingPrimary}
          onRepairSecondaryParents={handlers.repairSecondaryParents}
          onPruneInvalidDependencies={handlers.pruneInvalidDependencies}
        />
      </div>

      {props.sync ? (
        <EventGraphSyncSummary
          sync={props.sync}
          mode={mode}
          primaryCount={graph.primary.length}
          secondaryCount={graph.secondary.length}
          missingEvidencePrimaryCount={missingEvidencePrimaryCount}
          orphanSecondaryCount={dependencyDiagnostics.orphanSecondaryIds.length}
        />
      ) : null}

      {mode === 'focus' ? (
        <div className="space-y-3">
          <section className="rounded-xl border border-white/80 bg-white/92 p-3 shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  {t('eventGraphMaintenance.focusLabel', 'Focused Editor')}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{selected?.title || '-'}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {selected ? `${selected.level} · ${selected.eventHorizon}` : t('eventGraphEditor.selectEventToEdit')}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600"
                  onClick={() => {
                    setMode('overview');
                  }}
                >
                  {t('eventGraphMaintenance.backToInspect', 'Back to Inspect')}
                </button>
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600"
                  onClick={() => {
                    setMode('overview');
                  }}
                >
                  {t('eventGraphMaintenance.backToOverview', 'Back to Overview')}
                </button>
              </div>
            </div>
          </section>

          <section className="grid gap-3 xl:grid-cols-[320px_minmax(0,1fr)]">
            <div className="space-y-3">
              <EventListColumn
                title={t('eventGraphEditor.primaryEvents')}
                emptyText={t('eventGraphEditor.noPrimaryEvents')}
                items={graph.primary}
                selectedEventId={selectedEventId}
                readonly={props.readonly}
                onMove={handlers.movePrimary}
                onSelect={openInspectForEvent}
                secondaryCountByPrimary={secondaryCountByPrimary}
              />
              <EventListColumn
                title={t('eventGraphEditor.secondaryEvents')}
                emptyText={t('eventGraphEditor.noSecondaryEventsForParent')}
                items={secondaryForPrimary}
                selectedEventId={selectedEventId}
                readonly={props.readonly}
                onMove={(eventId, direction) => handlers.moveSecondary(eventId, activePrimaryId, direction)}
                onSelect={openInspectForEvent}
                evidenceCountOnly
              />
            </div>

            <div className="min-w-0">
              {selected ? (
                <EventDetailDrawer
                  event={selected}
                  sourceContextText={props.sourceContextText}
                  onChange={handlers.handleChangeSelected}
                  onDelete={handlers.handleDeleteSelected}
                />
              ) : (
                <div className="ui-sync-empty-card p-4 text-xs text-gray-500">
                  {t('eventGraphEditor.selectEventToEdit')}
                </div>
              )}
            </div>
          </section>
        </div>
      ) : (
        <div className="relative rounded-[24px] border border-white/80 bg-white/88 p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
          {canvasLists}
        </div>
      )}
    </section>
  );
}
