import type { ModAiClient } from '@nimiplatform/mod-sdk/ai';
import { runSynthesizeDraft } from '../engine/synthesize.js';
import type { Phase2Result, WorldStudioKnowledgeGraphDraft, WorldStudioRouteOverride } from '../engine/types.js';
import { withRouteOverride } from './route-capability-resolver.js';

export async function runPhase2DraftGeneration(
  aiClient: ModAiClient,
  input: {
    selectedStartTimeId: string;
    selectedCharacters: string[];
    knowledgeGraph?: Record<string, unknown>;
  },
  options?: {
    routeOverride?: WorldStudioRouteOverride | null;
    abortSignal?: AbortSignal;
  },
): Promise<Phase2Result> {
  const scopedLlm = withRouteOverride(aiClient, 'chat/fine', options?.routeOverride);
  return runSynthesizeDraft(scopedLlm, {
    selectedStartTimeId: input.selectedStartTimeId,
    selectedCharacters: input.selectedCharacters,
    knowledgeGraph: (input.knowledgeGraph || {
      worldSetting: '',
      timeline: [],
      locations: [],
      characters: [],
      events: {
        primary: [],
        secondary: [],
      },
      characterRelations: [],
      futureHistoricalEvents: [],
    }) as WorldStudioKnowledgeGraphDraft,
    abortSignal: options?.abortSignal,
  });
}
