import { asRecord } from '@nimiplatform/sdk/mod/utils';
import type { EventNodeDraft } from '../../contracts.js';

export function toLegacyPrimaryEvents(parsedKnowledgeGraph: Record<string, unknown>): EventNodeDraft[] {
  const legacyMajorEvents = Array.isArray((parsedKnowledgeGraph as { majorEvents?: unknown[] }).majorEvents)
    ? ((parsedKnowledgeGraph as { majorEvents?: unknown[] }).majorEvents || [])
    : [];

  return legacyMajorEvents.map((item, index) => {
    const event = asRecord(item);
    return {
      id: `legacy-primary-${index + 1}`,
      level: 'PRIMARY',
      parentEventId: null,
      title: String(event.title || `Legacy Event ${index + 1}`),
      summary: String(event.summary || event.description || ''),
      cause: String(event.cause || ''),
      process: String(event.process || ''),
      result: String(event.result || ''),
      timeRef: String(event.timeRef || ''),
      locationRefs: Array.isArray(event.locationRefs)
        ? event.locationRefs.map((entry) => String(entry || '')).filter(Boolean)
        : [],
      characterRefs: Array.isArray(event.characterRefs)
        ? event.characterRefs.map((entry) => String(entry || '')).filter(Boolean)
        : [],
      dependsOnEventIds: [],
      evidenceRefs: Array.isArray(event.evidenceRefs) ? event.evidenceRefs : [],
      confidence: Number.isFinite(Number(event.confidence)) ? Number(event.confidence) : 0.5,
      needsEvidence: !Array.isArray(event.evidenceRefs) || event.evidenceRefs.length === 0,
    } as EventNodeDraft;
  });
}
