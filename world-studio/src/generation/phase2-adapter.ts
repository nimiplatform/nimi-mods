import { runSynthesizeDraft } from '../engine/synthesize.js';
import type {
  FinalDraftAccumulator,
  Phase2Result,
  WorldStudioKnowledgeGraphDraft,
  WorldStudioRouteBinding,
} from '../engine/types.js';
import { withRouteBinding } from './route-capability-resolver.js';
import type { WorldStudioRuntimeAiClient } from '../runtime-ai-client.js';

export async function runPhase2DraftGeneration(
  aiClient: WorldStudioRuntimeAiClient,
  input: {
    selectedStartTimeId: string;
    selectedCharacters: string[];
    knowledgeGraph?: Record<string, unknown>;
    finalDraftAccumulator?: FinalDraftAccumulator;
  },
  options?: {
    binding?: WorldStudioRouteBinding | null;
    abortSignal?: AbortSignal;
  },
): Promise<Phase2Result> {
  const scopedLlm = withRouteBinding(aiClient, 'text.generate', options?.binding);
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
    finalDraftAccumulator: input.finalDraftAccumulator,
    abortSignal: options?.abortSignal,
  });
}
