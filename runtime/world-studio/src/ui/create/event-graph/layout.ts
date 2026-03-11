import type { EventNodeDraft } from '../../../contracts.js';

export function resolveExpandedPrimaryIds(input: {
  graphPrimary: EventNodeDraft[];
  expandedPrimaryIds?: string[];
}): string[] {
  const fromLayout = Array.isArray(input.expandedPrimaryIds) ? input.expandedPrimaryIds : [];
  if (fromLayout.length > 0) return fromLayout;
  const firstPrimaryId = String(input.graphPrimary[0]?.id || '').trim();
  return firstPrimaryId ? [firstPrimaryId] : [];
}

export function resolveSelectedEventId(input: {
  selectedEventId?: string;
  graphPrimary: EventNodeDraft[];
  graphSecondary: EventNodeDraft[];
}): string {
  return input.selectedEventId
    || input.graphPrimary[0]?.id
    || input.graphSecondary[0]?.id
    || '';
}

export function resolveActivePrimaryId(input: {
  selectedPrimaryId: string | null;
  selectedSecondaryParentId: string | null;
  graphPrimary: EventNodeDraft[];
}): string {
  return input.selectedPrimaryId || input.selectedSecondaryParentId || input.graphPrimary[0]?.id || '';
}
