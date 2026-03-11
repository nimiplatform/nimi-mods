import type { EventNodeDraft } from '../../../contracts.js';
import {
  applyEvidenceTemplateForMissingPrimary as applyEvidenceTemplateForMissingPrimaryMutation,
  movePrimaryEvent,
  moveSecondaryEvent,
  pruneInvalidDependencies as pruneInvalidDependenciesMutation,
  repairSecondaryParents as repairSecondaryParentsMutation,
} from './graph-mutations.js';
import { makeEventId, normalizeEvent } from './state.js';

type GraphState = {
  primary: EventNodeDraft[];
  secondary: EventNodeDraft[];
};

type GraphLayout = {
  selectedEventId: string;
  expandedPrimaryIds: string[];
};

type CreateEventGraphActionsInput = {
  graph: GraphState;
  selectedEventId: string;
  expandedPrimaryIds: string[];
  activePrimaryId: string;
  selected: EventNodeDraft | null;
  emitGraph: (next: GraphState) => void;
  onLayoutChange?: (next: GraphLayout) => void;
};

export function createEventGraphActions(input: CreateEventGraphActionsInput) {
  const emitLayout = (next: GraphLayout) => {
    input.onLayoutChange?.(next);
  };

  const setSelected = (eventId: string) => {
    const selectedPrimaryId = input.graph.primary.some((item) => item.id === eventId)
      ? eventId
      : (input.graph.secondary.find((item) => item.id === eventId)?.parentEventId || '');
    const nextExpanded = selectedPrimaryId
      ? [...new Set([...input.expandedPrimaryIds, selectedPrimaryId])]
      : input.expandedPrimaryIds;
    emitLayout({
      selectedEventId: eventId,
      expandedPrimaryIds: nextExpanded,
    });
  };

  const toggleExpanded = (primaryId: string) => {
    const normalized = String(primaryId || '').trim();
    if (!normalized) return;
    const has = input.expandedPrimaryIds.includes(normalized);
    const nextExpanded = has
      ? input.expandedPrimaryIds.filter((id) => id !== normalized)
      : [...input.expandedPrimaryIds, normalized];
    emitLayout({
      selectedEventId: input.selectedEventId,
      expandedPrimaryIds: nextExpanded,
    });
  };

  const movePrimary = (eventId: string, direction: 'up' | 'down') => {
    input.emitGraph({
      primary: movePrimaryEvent(input.graph.primary, eventId, direction),
      secondary: input.graph.secondary,
    });
  };

  const moveSecondary = (eventId: string, parentEventId: string, direction: 'up' | 'down') => {
    input.emitGraph({
      primary: input.graph.primary,
      secondary: moveSecondaryEvent(input.graph.secondary, eventId, parentEventId, direction),
    });
  };

  const applyEvidenceTemplateForMissingPrimary = () => {
    input.emitGraph({
      primary: applyEvidenceTemplateForMissingPrimaryMutation(input.graph.primary),
      secondary: input.graph.secondary,
    });
  };

  const repairSecondaryParents = () => {
    if (input.graph.primary.length === 0) return;
    const fallbackPrimaryId = input.activePrimaryId || input.graph.primary[0]?.id || '';
    if (!fallbackPrimaryId) return;
    const nextSecondary = repairSecondaryParentsMutation(
      input.graph.secondary,
      input.graph.primary,
      fallbackPrimaryId,
    );
    input.emitGraph({
      primary: input.graph.primary,
      secondary: nextSecondary,
    });
    emitLayout({
      selectedEventId: input.selectedEventId,
      expandedPrimaryIds: [...new Set([...input.expandedPrimaryIds, fallbackPrimaryId])],
    });
  };

  const pruneInvalidDependencies = () => {
    input.emitGraph(pruneInvalidDependenciesMutation(input.graph));
  };

  const handleAddPrimary = () => {
    const nextEvent = normalizeEvent({
      id: makeEventId('primary'),
      level: 'PRIMARY',
      title: `Primary Event ${input.graph.primary.length + 1}`,
    }, 'PRIMARY');
    input.emitGraph({
      primary: [...input.graph.primary, nextEvent],
      secondary: input.graph.secondary,
    });
    emitLayout({
      selectedEventId: nextEvent.id,
      expandedPrimaryIds: [...new Set([...input.expandedPrimaryIds, nextEvent.id])],
    });
  };

  const handleAddSecondary = () => {
    if (!input.activePrimaryId) return;
    const nextEvent = normalizeEvent({
      id: makeEventId('secondary'),
      level: 'SECONDARY',
      parentEventId: input.activePrimaryId,
      title: `Secondary Event ${input.graph.secondary.length + 1}`,
    }, 'SECONDARY');
    input.emitGraph({
      primary: input.graph.primary,
      secondary: [...input.graph.secondary, nextEvent],
    });
    emitLayout({
      selectedEventId: nextEvent.id,
      expandedPrimaryIds: [...new Set([...input.expandedPrimaryIds, input.activePrimaryId])],
    });
  };

  const handleChangeSelected = (next: EventNodeDraft) => {
    if (next.level === 'PRIMARY') {
      const promotedPrimary = input.graph.primary.some((item) => item.id === next.id);
      const nextPrimary = promotedPrimary
        ? input.graph.primary.map((item) => (item.id === next.id ? normalizeEvent(next, 'PRIMARY') : item))
        : [...input.graph.primary, normalizeEvent({ ...next, parentEventId: null }, 'PRIMARY')];
      const nextSecondary = input.graph.secondary
        .filter((item) => item.id !== next.id)
        .map((item) => (item.parentEventId === next.id ? { ...item, parentEventId: null } : item));
      input.emitGraph({ primary: nextPrimary, secondary: nextSecondary });
      return;
    }
    const targetParentId = next.parentEventId || input.activePrimaryId || input.graph.primary[0]?.id || null;
    const secondaryNode = normalizeEvent({ ...next, parentEventId: targetParentId }, 'SECONDARY');
    const existsInSecondary = input.graph.secondary.some((item) => item.id === next.id);
    const nextSecondary = existsInSecondary
      ? input.graph.secondary.map((item) => (item.id === next.id ? secondaryNode : item))
      : [...input.graph.secondary, secondaryNode];
    const nextPrimary = input.graph.primary.filter((item) => item.id !== next.id);
    input.emitGraph({ primary: nextPrimary, secondary: nextSecondary });
  };

  const handleDeleteSelected = () => {
    if (!input.selected) return;
    const isPrimary = input.graph.primary.some((item) => item.id === input.selected?.id);
    if (isPrimary) {
      const nextPrimary = input.graph.primary.filter((item) => item.id !== input.selected?.id);
      const nextSecondary = input.graph.secondary.filter((item) => item.parentEventId !== input.selected?.id);
      input.emitGraph({ primary: nextPrimary, secondary: nextSecondary });
      setSelected(nextPrimary[0]?.id || nextSecondary[0]?.id || '');
      return;
    }
    const nextSecondary = input.graph.secondary.filter((item) => item.id !== input.selected?.id);
    input.emitGraph({ primary: input.graph.primary, secondary: nextSecondary });
    setSelected(input.graph.primary[0]?.id || nextSecondary[0]?.id || '');
  };

  return {
    setSelected,
    toggleExpanded,
    movePrimary,
    moveSecondary,
    applyEvidenceTemplateForMissingPrimary,
    repairSecondaryParents,
    pruneInvalidDependencies,
    handleAddPrimary,
    handleAddSecondary,
    handleChangeSelected,
    handleDeleteSelected,
  };
}
