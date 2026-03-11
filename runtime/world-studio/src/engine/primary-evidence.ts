import { isEvidenceRequiredForEvent } from '../services/event-horizon.js';

export const PRIMARY_EVIDENCE_COVERAGE_BLOCK_THRESHOLD = 0.75;

export function countPrimaryEventsWithEvidence(events: Array<{
  level?: unknown;
  eventHorizon?: unknown;
  evidenceRefs?: unknown[];
}>): number {
  return events.filter((event) => {
    if (!isEvidenceRequiredForEvent(event)) return false;
    return Array.isArray(event.evidenceRefs) && event.evidenceRefs.length > 0;
  }).length;
}

export function computePrimaryEvidenceCoverage(events: Array<{
  level?: unknown;
  eventHorizon?: unknown;
  evidenceRefs?: unknown[];
}>): number {
  const eligible = events.filter((event) => isEvidenceRequiredForEvent(event));
  if (eligible.length === 0) return 1;
  const total = Math.max(1, eligible.length);
  return countPrimaryEventsWithEvidence(eligible) / total;
}

export function summarizePrimaryEvidenceCoverage(events: Array<{
  level?: unknown;
  eventHorizon?: unknown;
  evidenceRefs?: unknown[];
}>): {
  total: number;
  withEvidence: number;
  missing: number;
  coverage: number;
} {
  const eligible = events.filter((event) => isEvidenceRequiredForEvent(event));
  const total = eligible.length;
  const withEvidence = countPrimaryEventsWithEvidence(eligible);
  const missing = Math.max(0, total - withEvidence);
  const coverage = total > 0 ? (withEvidence / total) : 1;
  return {
    total,
    withEvidence,
    missing,
    coverage,
  };
}
