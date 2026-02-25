import { useMemo } from 'react';
import { summarizeTerminalChunkTasks } from '../ui/status-summary.js';
import type { EventNodeDraft } from '../contracts.js';
import type { Phase1Result } from '../generation/pipeline.js';

type EventGraphDraft = {
  primary: EventNodeDraft[];
  secondary: EventNodeDraft[];
};

export function useWorldStudioStatusMetrics(input: {
  eventsGraph: EventGraphDraft;
  phase1: Phase1Result | null;
}) {
  const terminalChunkSummary = useMemo(
    () => summarizeTerminalChunkTasks(input.phase1?.chunkTasks || []),
    [input.phase1?.chunkTasks],
  );
  const terminalChunkTotal = terminalChunkSummary.total;
  const terminalChunkFailed = terminalChunkSummary.failed;
  const terminalChunkSuccess = terminalChunkSummary.success;
  const terminalTopFailure = terminalChunkSummary.topFailure;

  const primaryEventCount = input.eventsGraph.primary.length;
  const secondaryEventCount = input.eventsGraph.secondary.length;
  const missingPrimaryEvidenceCount = input.eventsGraph.primary
    .filter((item) => item.evidenceRefs.length === 0)
    .length;
  const allEventCount = Math.max(1, primaryEventCount + secondaryEventCount);
  const eventCharacterCoverage = Math.round(
    (
      [...input.eventsGraph.primary, ...input.eventsGraph.secondary]
        .filter((item) => item.characterRefs.length > 0)
        .length / allEventCount
    ) * 100,
  );
  const eventLocationCoverage = Math.round(
    (
      [...input.eventsGraph.primary, ...input.eventsGraph.secondary]
        .filter((item) => item.locationRefs.length > 0)
        .length / allEventCount
    ) * 100,
  );

  return {
    terminalChunkSummary,
    terminalChunkTotal,
    terminalChunkFailed,
    terminalChunkSuccess,
    terminalTopFailure,
    primaryEventCount,
    secondaryEventCount,
    missingPrimaryEvidenceCount,
    eventCharacterCoverage,
    eventLocationCoverage,
  };
}
