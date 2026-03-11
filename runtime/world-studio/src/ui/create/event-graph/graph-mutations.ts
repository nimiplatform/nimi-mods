import type { EventNodeDraft } from '../../../contracts.js';
import { countPrimaryEventsMissingEvidence } from '../../../services/event-horizon.js';
import { moveItemByIndex } from './state.js';

export function movePrimaryEvent(
  primary: EventNodeDraft[],
  eventId: string,
  direction: 'up' | 'down',
): EventNodeDraft[] {
  const index = primary.findIndex((item) => item.id === eventId);
  if (index < 0) return primary;
  const target = direction === 'up' ? index - 1 : index + 1;
  return moveItemByIndex(primary, index, target);
}

export function moveSecondaryEvent(
  secondary: EventNodeDraft[],
  eventId: string,
  parentEventId: string,
  direction: 'up' | 'down',
): EventNodeDraft[] {
  const siblingIndices = secondary
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.parentEventId === parentEventId);
  const siblingPos = siblingIndices.findIndex(({ item }) => item.id === eventId);
  if (siblingPos < 0) return secondary;
  const targetSiblingPos = direction === 'up' ? siblingPos - 1 : siblingPos + 1;
  if (targetSiblingPos < 0 || targetSiblingPos >= siblingIndices.length) return secondary;
  const fromSibling = siblingIndices[siblingPos];
  const toSibling = siblingIndices[targetSiblingPos];
  if (!fromSibling || !toSibling) return secondary;
  const fromIndex = fromSibling.index;
  const toIndex = toSibling.index;
  return moveItemByIndex(secondary, fromIndex, toIndex);
}

export function applyEvidenceTemplateForMissingPrimary(primary: EventNodeDraft[]): EventNodeDraft[] {
  const missingEvidencePrimaryCount = countPrimaryEventsMissingEvidence(primary);
  if (missingEvidencePrimaryCount <= 0) return primary;
  const baseSegmentId = `manual-evidence-${Date.now()}`;
  return primary.map((event, index) => {
    if (event.evidenceRefs.length > 0 || event.eventHorizon === 'FUTURE') return event;
    const excerpt = String(event.summary || event.process || event.title || '').trim().slice(0, 280);
    return {
      ...event,
      evidenceRefs: [{
        segmentId: `${baseSegmentId}-${index + 1}`,
        offsetStart: 0,
        offsetEnd: Math.max(1, excerpt.length),
        excerpt: excerpt || `Evidence placeholder for ${event.title || event.id}`,
        confidence: 0.4,
        sourceType: 'text',
      }],
      needsEvidence: false,
    };
  });
}

export function repairSecondaryParents(
  secondary: EventNodeDraft[],
  primary: EventNodeDraft[],
  fallbackPrimaryId: string,
): EventNodeDraft[] {
  if (!fallbackPrimaryId) return secondary;
  const primaryIdSet = new Set(primary.map((item) => String(item.id || '').trim()).filter(Boolean));
  return secondary.map((event) => {
    const parentId = String(event.parentEventId || '').trim();
    if (parentId && primaryIdSet.has(parentId)) return event;
    return {
      ...event,
      parentEventId: fallbackPrimaryId,
    };
  });
}

export function pruneInvalidDependencies(graph: {
  primary: EventNodeDraft[];
  secondary: EventNodeDraft[];
}): {
  primary: EventNodeDraft[];
  secondary: EventNodeDraft[];
} {
  const idSet = new Set([...graph.primary, ...graph.secondary].map((item) => String(item.id || '').trim()).filter(Boolean));
  const dependencyMap = new Map<string, string[]>();
  [...graph.primary, ...graph.secondary].forEach((event) => {
    const eventId = String(event.id || '').trim();
    if (!eventId) return;
    const deps = [...new Set(
      (Array.isArray(event.dependsOnEventIds) ? event.dependsOnEventIds : [])
        .map((item) => String(item || '').trim())
        .filter((depId) => Boolean(depId) && depId !== eventId && idSet.has(depId)),
    )];
    dependencyMap.set(eventId, deps);
  });

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const breakCycles = (eventId: string) => {
    if (visited.has(eventId)) return;
    visiting.add(eventId);
    const deps = dependencyMap.get(eventId) || [];
    const cleaned: string[] = [];
    deps.forEach((depId) => {
      if (!idSet.has(depId)) return;
      if (visiting.has(depId)) {
        return;
      }
      if (!visited.has(depId)) {
        breakCycles(depId);
      }
      cleaned.push(depId);
    });
    dependencyMap.set(eventId, [...new Set(cleaned)]);
    visiting.delete(eventId);
    visited.add(eventId);
  };

  Array.from(idSet.values()).forEach((eventId) => breakCycles(eventId));
  const sanitize = (event: EventNodeDraft) => ({
    ...event,
    dependsOnEventIds: dependencyMap.get(String(event.id || '').trim()) || [],
  });
  return {
    primary: graph.primary.map(sanitize),
    secondary: graph.secondary.map(sanitize),
  };
}
