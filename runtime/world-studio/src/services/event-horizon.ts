export type WorldStudioEventHorizon = 'PAST' | 'ONGOING' | 'FUTURE';

export function normalizeEventHorizon(
  value: unknown,
  fallback: WorldStudioEventHorizon = 'PAST',
): WorldStudioEventHorizon {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'ONGOING' || normalized === 'FUTURE' || normalized === 'PAST') {
    return normalized;
  }
  return fallback;
}

export function isEvidenceRequiredForEvent(input: {
  level?: unknown;
  eventHorizon?: unknown;
}): boolean {
  const level = String(input.level || '').trim().toUpperCase();
  if (level !== 'PRIMARY') return false;
  return normalizeEventHorizon(input.eventHorizon, 'PAST') !== 'FUTURE';
}

export function deriveNeedsEvidence(input: {
  level?: unknown;
  eventHorizon?: unknown;
  evidenceRefs?: unknown;
  needsEvidence?: unknown;
}): boolean {
  const explicitNeedsEvidence = typeof input.needsEvidence === 'boolean'
    ? input.needsEvidence
    : false;
  if (!isEvidenceRequiredForEvent(input)) {
    return explicitNeedsEvidence;
  }
  const evidenceCount = Array.isArray(input.evidenceRefs) ? input.evidenceRefs.length : 0;
  return evidenceCount === 0;
}

export function countPrimaryEventsMissingEvidence(
  events: Array<{
    level?: unknown;
    eventHorizon?: unknown;
    evidenceRefs?: unknown;
  }>,
): number {
  return events.filter((event) => {
    if (!isEvidenceRequiredForEvent(event)) return false;
    return !Array.isArray(event.evidenceRefs) || event.evidenceRefs.length === 0;
  }).length;
}
