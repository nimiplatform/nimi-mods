import { asRecord } from '@nimiplatform/sdk/mod/utils';
import { NARRATIVE_REASON_CODES } from '../contracts.js';
import { NarrativeCoreOutputSchema } from '../schemas.js';
import type {
  NarrativeCoreOutput,
  NarrativeStepResult,
  NarrativeTurnInputNormalized,
} from '../types.js';
import type { NarrativeStep1AssemblyResult } from './step1-assembly.js';

function buildGeneratePrompt(input: {
  turn: NarrativeTurnInputNormalized;
  assembly: NarrativeStep1AssemblyResult;
}): string {
  const payload = {
    task: 'compile_narrative_turn',
    constraints: {
      topLevelWhitelist: ['spineEvents', 'stateChanges', 'metrics'],
      visibilityEnum: ['public', 'internal', 'sensory'],
      eventTypeWhitelist: ['scene-beat', 'dialogue', 'action', 'state-change'],
      maxEvents: 12,
      minEvents: 1,
      metricRange: [0, 1],
    },
    input: {
      triggerSource: input.turn.triggerSource,
      userMessage: input.turn.userMessage,
      systemContext: input.turn.systemContext,
      storyId: input.turn.storyId,
      worldId: input.turn.worldId,
      agentId: input.turn.agentId,
      playerId: input.turn.playerId,
      snapshot: input.assembly.snapshot,
      storyState: {
        phase: input.assembly.snapshot.phase,
        objective: input.assembly.snapshot.objective,
        tensionTarget: input.assembly.snapshot.tensionTarget,
        openThreads: input.assembly.snapshot.openThreads,
      },
      startupPolicy: input.assembly.snapshot.startupPolicy,
      futurePressure: input.assembly.snapshot.futurePressure,
      contextCoverage: input.assembly.snapshot.contextCoverage,
      memoryRecall: input.assembly.assets.memoryRecall,
      worldEvents: input.assembly.assets.worldEvents.slice(0, 20),
      worldLorebooks: input.assembly.assets.worldLorebooks.slice(0, 20),
      worldScenes: input.assembly.assets.worldScenes.slice(0, 20),
      narrativeContexts: input.assembly.assets.narrativeContexts.slice(0, 20),
    },
    outputJsonShape: {
      spineEvents: [
        {
          id: 'ULID-like string',
          type: 'scene-beat|dialogue|action|state-change',
          visibility: 'public|internal|sensory',
          payload: {},
          sourceEventIds: ['string'],
          thinker: 'optional actor id',
          decider: 'optional actor id',
          experiencer: 'optional actor id',
          owner: 'optional actor id',
        },
      ],
      stateChanges: {},
      metrics: {
        coherence: 0,
        groundedRatio: 0,
        tension: 0,
      },
    },
    outputRule: 'return strict JSON object only, without markdown fences',
  };
  return JSON.stringify(payload);
}

function extractJsonObjectText(text: string): string {
  const normalized = String(text || '').trim();
  if (!normalized) {
    return '{}';
  }
  const fenced = normalized.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) {
    return fenced[1].trim();
  }
  const firstBrace = normalized.indexOf('{');
  const lastBrace = normalized.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return normalized.slice(firstBrace, lastBrace + 1);
  }
  return normalized;
}

function parseCoreOutput(text: string): NarrativeCoreOutput | null {
  const jsonText = extractJsonObjectText(text);
  try {
    const parsed = JSON.parse(jsonText);
    const result = NarrativeCoreOutputSchema.safeParse(parsed);
    if (!result.success) {
      return null;
    }
    return result.data as NarrativeCoreOutput;
  } catch {
    return null;
  }
}

export async function runNarrativeStep2Generate(input: {
  turn: NarrativeTurnInputNormalized;
  assembly: NarrativeStep1AssemblyResult;
  generateText: (payload: {
    prompt: string;
    systemPrompt?: string;
    routeHint?: string;
    routeOverride?: Record<string, unknown>;
    worldId?: string;
    agentId?: string;
    maxTokens?: number;
    temperature?: number;
    mode?: 'STORY' | 'SCENE_TURN';
  }) => Promise<{ text: string }>;
}): Promise<NarrativeStepResult<NarrativeCoreOutput>> {
  if (input.turn.mockCoreOutput) {
    const mockValidation = NarrativeCoreOutputSchema.safeParse(input.turn.mockCoreOutput);
    if (mockValidation.success) {
      return {
        ok: true,
        reasonCode: null,
        actionHint: 'step2-generate-mock-output',
        value: mockValidation.data as NarrativeCoreOutput,
      };
    }
  }

  try {
    const prompt = buildGeneratePrompt({
      turn: input.turn,
      assembly: input.assembly,
    });

    const response = await input.generateText({
      prompt,
      systemPrompt: 'You are a narrative compiler. Output strict JSON only.',
      routeHint: input.turn.routeHint,
      routeOverride: asRecord(input.turn.routeOverride),
      worldId: input.turn.worldId,
      agentId: input.turn.agentId,
      maxTokens: 1400,
      temperature: 0.3,
      mode: 'SCENE_TURN',
    });

    const coreOutput = parseCoreOutput(response.text);
    if (!coreOutput) {
      return {
        ok: false,
        reasonCode: NARRATIVE_REASON_CODES.NARRATIVE_GENERATION_SCHEMA_INVALID,
        actionHint: 'Repair CoreOutput schema contract and retry.',
        value: null,
      };
    }

    return {
      ok: true,
      reasonCode: null,
      actionHint: 'step2-generate-passed',
      value: coreOutput,
    };
  } catch {
    return {
      ok: false,
      reasonCode: NARRATIVE_REASON_CODES.NARRATIVE_GENERATION_SCHEMA_INVALID,
      actionHint: 'Repair CoreOutput schema contract and retry.',
      value: null,
    };
  }
}
