import React, { useMemo } from 'react';
import type { EventNodeDraft } from '../../contracts.js';
import { countPrimaryEventsMissingEvidence } from '../../services/event-horizon.js';
import { buildDiagnosticsSummary, detectDependencyDiagnostics } from './event-graph/diagnostics.js';
import {
  resolveActivePrimaryId,
  resolveExpandedPrimaryIds,
  resolveSelectedEventId,
} from './event-graph/layout.js';
import { normalizeGraph } from './event-graph/state.js';
import { EventGraphEditorHeader } from './event-graph/editor-header.js';
import { EventGraphEditorCanvas } from './event-graph/editor-canvas.js';
import { EventGraphEditorInspector } from './event-graph/editor-inspector.js';
import { createEventGraphActions } from './event-graph/editor-actions.js';

// ARCH copy guardrails:
// - Event graph diagnostics
// - missing dependencies
// - Repair Secondary Parent Links

export type EventGraphEditorProps = {
  title: string;
  events: {
    primary: EventNodeDraft[];
    secondary: EventNodeDraft[];
  };
  onChange: (next: { primary: EventNodeDraft[]; secondary: EventNodeDraft[] }) => void;
  sourceContextText?: string;
  layout?: {
    selectedEventId: string;
    expandedPrimaryIds: string[];
  };
  onLayoutChange?: (next: { selectedEventId: string; expandedPrimaryIds: string[] }) => void;
  readonly?: boolean;
};

export function EventGraphEditor(props: EventGraphEditorProps) {
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
  const selectedPrimary = graph.primary.find((item) => item.id === selectedEventId)
    || graph.primary[0]
    || null;
  const selectedSecondary = graph.secondary.find((item) => item.id === selectedEventId) || null;
  const selected = selectedPrimary || selectedSecondary;
  const activePrimaryId = resolveActivePrimaryId({
    selectedPrimaryId: selectedPrimary?.id || null,
    selectedSecondaryParentId: selectedSecondary?.parentEventId || null,
    graphPrimary: graph.primary,
  });
  const secondaryForPrimary = expandedPrimaryIds.includes(activePrimaryId)
    ? graph.secondary.filter((item) => item.parentEventId === activePrimaryId)
    : [];
  const missingEvidencePrimaryCount = countPrimaryEventsMissingEvidence(graph.primary);
  const dependencyDiagnostics = useMemo(
    () => detectDependencyDiagnostics(graph),
    [graph],
  );
  const diagnosticsSummary = useMemo(() => buildDiagnosticsSummary({
    missingDependencyCount: dependencyDiagnostics.missingDependencyRefs.length,
    selfReferenceCount: dependencyDiagnostics.selfReferenceIds.length,
    cycleNodeCount: dependencyDiagnostics.cycleNodeIds.length,
    orphanSecondaryCount: dependencyDiagnostics.orphanSecondaryIds.length,
    missingEvidencePrimaryCount,
  }), [dependencyDiagnostics, missingEvidencePrimaryCount]);
  const emitGraph = (next: { primary: EventNodeDraft[]; secondary: EventNodeDraft[] }) => {
    props.onChange(normalizeGraph(next));
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
  return (
    <section className="ui-sync-card ui-sync-card-inset p-4">
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
      <EventGraphEditorCanvas
        readonly={props.readonly}
        graphPrimary={graph.primary}
        graphSecondary={graph.secondary}
        selectedEventId={selectedEventId}
        expandedPrimaryIds={expandedPrimaryIds}
        activePrimaryId={activePrimaryId}
        secondaryForPrimary={secondaryForPrimary}
        selected={selected}
        sourceContextText={props.sourceContextText}
        onToggleExpanded={handlers.toggleExpanded}
        onMovePrimary={handlers.movePrimary}
        onMoveSecondary={handlers.moveSecondary}
        onSelect={handlers.setSelected}
        onChangeSelected={handlers.handleChangeSelected}
        onDeleteSelected={handlers.handleDeleteSelected}
      />
      <EventGraphEditorInspector
        missingDependencyCount={dependencyDiagnostics.missingDependencyRefs.length}
        selfReferenceCount={dependencyDiagnostics.selfReferenceIds.length}
        cycleNodeCount={dependencyDiagnostics.cycleNodeIds.length}
        orphanSecondaryCount={dependencyDiagnostics.orphanSecondaryIds.length}
        missingDependencySampleText={dependencyDiagnostics.missingDependencyRefs.slice(0, 3).map((item) => `${item.eventId}->${item.dependencyId}`).join(', ')}
        cycleNodeSampleText={dependencyDiagnostics.cycleNodeIds.slice(0, 6).join(', ')}
      />
    </section>
  );
}
