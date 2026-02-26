export const PRIMARY_EVIDENCE_COVERAGE_BLOCK_THRESHOLD = 0.9;

export function countPrimaryEventsWithEvidence(events: Array<{ evidenceRefs?: unknown[] }>): number {
  return events.filter((event) => Array.isArray(event.evidenceRefs) && event.evidenceRefs.length > 0).length;
}

export function computePrimaryEvidenceCoverage(events: Array<{ evidenceRefs?: unknown[] }>): number {
  const total = Math.max(1, events.length);
  return countPrimaryEventsWithEvidence(events) / total;
}

export function summarizePrimaryEvidenceCoverage(events: Array<{ evidenceRefs?: unknown[] }>): {
  total: number;
  withEvidence: number;
  missing: number;
  coverage: number;
} {
  const total = events.length;
  const withEvidence = countPrimaryEventsWithEvidence(events);
  const missing = Math.max(0, total - withEvidence);
  const coverage = total > 0 ? (withEvidence / total) : 0;
  return {
    total,
    withEvidence,
    missing,
    coverage,
  };
}

