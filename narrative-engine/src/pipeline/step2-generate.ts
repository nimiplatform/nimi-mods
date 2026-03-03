import { asRecord } from '@nimiplatform/sdk/mod/utils';
import { NARRATIVE_REASON_CODES } from '../contracts.js';
import { NarrativeCoreOutputSchema } from '../schemas.js';
import type {
  NarrativeCoreOutput,
  NarrativeStepResult,
  NarrativeTurnInputNormalized,
} from '../types.js';
import type { NarrativeStep1AssemblyResult } from './step1-assembly.js';
import { createUlid } from '../utils/ulid.js';

const SPINE_EVENT_TYPES = ['scene-beat', 'dialogue', 'action', 'state-change'] as const;
const VISIBILITY_TYPES = ['public', 'internal', 'sensory'] as const;
const SPINE_EVENT_TYPE_SET = new Set<string>(SPINE_EVENT_TYPES);
const VISIBILITY_TYPE_SET = new Set<string>(VISIBILITY_TYPES);

function sanitizePromptValue(value: string): string {
  return String(value || '')
    .replace(/\{\{/g, '{ {')
    .replace(/\}\}/g, '} }')
    .trim();
}

function buildGeneratePrompt(input: {
  turn: NarrativeTurnInputNormalized;
  assembly: NarrativeStep1AssemblyResult;
}): string {
  const openingRule = input.turn.triggerSource === 'SystemEvent' || input.turn.triggerSource === 'AgentInitiative'
    ? [
      '- This is a system/world driven turn. Produce an opening or proactive beat.',
      '- Ensure the first spine event establishes place, current stakes, and immediate objective.',
      '- Keep continuity with timeline/lore context. Do not reveal future events as facts.',
    ].join('\n')
    : [
      '- This is a user driven turn. The first spine event must directly respond to the user move.',
      '- Keep the response grounded in scene constraints and character capability.',
    ].join('\n');

  const sections = [
    '# Role',
    'You are the narrative compiler for a story turn.',
    'Output must be strict JSON only (no markdown, no prose preface, no suffix text).',
    '',
    '# Output Contract',
    '- Top-level keys MUST be exactly: spineEvents, stateChanges, metrics.',
    `- spineEvents[*].type MUST be one of: ${SPINE_EVENT_TYPES.join(', ')}`,
    `- spineEvents[*].visibility MUST be one of: ${VISIBILITY_TYPES.join(', ')}`,
    '- spineEvents length MUST be between 1 and 12.',
    '- metrics values MUST be finite numbers in [0, 1].',
    '',
    '# Generation Policy',
    '- Keep canon consistency and scene coherence.',
    '- Keep tension progression smooth; avoid abrupt jumps.',
    '- Internal visibility is only for private cognition events.',
    '- Return compact but semantically complete payload fields.',
    '- NPCs must maintain autonomy and strategic self-interest; avoid passive compliance.',
    '- Do not close major conflict in a single turn unless source facts explicitly prove closure.',
    '- For extraordinary player claims, generate proportionate skepticism, verification, or pushback.',
    '- Preserve unresolved pressure/open threads to keep narrative continuity.',
    '- Future notes from context are hidden author notes: never narrate them as established facts.',
    '- Anti-people-pleasing rule: prioritize believable world reaction over player wish-fulfillment.',
    '',
    '# Constraint Priority (P0-P4)',
    '- P0 Safety: no policy-violating content.',
    '- P1 Hard rules: no world-rule or identity-contract breach.',
    '- P2 Canon continuity: no reversal of established facts; avoid semantic retcon.',
    '- P2 Story direction: keep one unresolved pressure and causal progression.',
    '- P3 Rhythm hints: avoid dialogue-only loops and low-action plateaus.',
    '- P4 Style: concise and vivid, can be relaxed if higher priorities conflict.',
    '',
    '# Trigger',
    `triggerSource=${input.turn.triggerSource}`,
    `userMessage=${sanitizePromptValue(input.turn.userMessage || '(empty)')}`,
    `systemContext=${sanitizePromptValue(JSON.stringify(input.turn.systemContext || {}))}`,
    '',
    '# Opening Or Response Rule',
    openingRule,
    '',
    '# Compiled Context',
    sanitizePromptValue(input.assembly.assets.compiledPrompt),
    '',
    '# JSON Shape Reference',
    JSON.stringify({
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
        coherence: 0.7,
        groundedRatio: 0.7,
        tension: 0.5,
      },
    }),
    '',
    '# Self-Review (Mandatory Before Output)',
    '- Check P0-P2 violations and repair before final output.',
    '- If an event implies a fact reversal, rewrite to additive progression (Yes-And).',
    '- Ensure at least one unresolved tension remains after this turn.',
    '- Ensure first event obeys opening/response rule for current trigger.',
    '',
    '# Final Rule',
    'Return one JSON object only.',
  ];

  return sections.join('\n');
}

function buildRepairPrompt(input: {
  turn: NarrativeTurnInputNormalized;
  previousRawOutput: string;
}): string {
  const rawOutput = String(input.previousRawOutput || '').slice(0, 6000);
  const sections = [
    '# Task',
    'Repair the malformed narrative JSON into a valid CoreOutput object.',
    'Return strict JSON only (no markdown, no explanation).',
    '',
    '# Required Shape',
    '- top-level keys: spineEvents, stateChanges, metrics',
    '- spineEvents: non-empty array',
    `- spineEvents[*].type in: ${SPINE_EVENT_TYPES.join(', ')}`,
    `- spineEvents[*].visibility in: ${VISIBILITY_TYPES.join(', ')}`,
    '- metrics values must be finite numbers',
    '',
    '# Trigger',
    `triggerSource=${input.turn.triggerSource}`,
    `userMessage=${sanitizePromptValue(input.turn.userMessage || '(empty)')}`,
    '',
    '# Malformed Candidate',
    rawOutput || '(empty)',
    '',
    '# Final Rule',
    'Output one valid JSON object only.',
  ];
  return sections.join('\n');
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

function tryParseJsonObject(text: string): unknown | null {
  const candidate = String(text || '').trim();
  if (!candidate) {
    return null;
  }
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function repairLikelyTruncatedJson(text: string): string {
  let repaired = String(text || '').trim();
  if (!repaired) {
    return repaired;
  }
  const curlyOpen = (repaired.match(/\{/g) || []).length;
  const curlyClose = (repaired.match(/\}/g) || []).length;
  const squareOpen = (repaired.match(/\[/g) || []).length;
  const squareClose = (repaired.match(/\]/g) || []).length;
  if (squareOpen > squareClose) {
    repaired += ']'.repeat(squareOpen - squareClose);
  }
  if (curlyOpen > curlyClose) {
    repaired += '}'.repeat(curlyOpen - curlyClose);
  }
  return repaired;
}

function toFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

function coerceCoreOutput(parsed: unknown): NarrativeCoreOutput | null {
  const record = asRecord(parsed);
  const rawEvents = Array.isArray(record.spineEvents) ? record.spineEvents : [];
  if (rawEvents.length === 0) {
    return null;
  }

  const seenIds = new Set<string>();
  const events = rawEvents.map((item, index) => {
    const eventRecord = asRecord(item);
    let id = String(eventRecord.id || '').trim();
    if (!id) {
      id = `evt-${createUlid()}`;
    }
    if (seenIds.has(id)) {
      id = `${id}-${index + 1}`;
    }
    seenIds.add(id);

    const rawType = String(eventRecord.type || '').trim().toLowerCase();
    const type = SPINE_EVENT_TYPE_SET.has(rawType) ? rawType : 'scene-beat';

    const rawVisibility = String(eventRecord.visibility || '').trim().toLowerCase();
    const visibility = VISIBILITY_TYPE_SET.has(rawVisibility) ? rawVisibility : 'public';

    const payloadRecord = asRecord(eventRecord.payload);
    const payload = Object.keys(payloadRecord).length > 0
      ? payloadRecord
      : {
        description: String(
          eventRecord.description
          || eventRecord.summary
          || eventRecord.content
          || eventRecord.text
          || '',
        ).trim(),
      };

    const sourceEventIds = Array.isArray(eventRecord.sourceEventIds)
      ? eventRecord.sourceEventIds
        .map((sourceEventId) => String(sourceEventId || '').trim())
        .filter(Boolean)
      : undefined;

    const thinker = String(eventRecord.thinker || '').trim() || undefined;
    const decider = String(eventRecord.decider || '').trim() || undefined;
    const experiencer = String(eventRecord.experiencer || '').trim() || undefined;
    const owner = String(eventRecord.owner || '').trim() || undefined;

    return {
      id,
      type,
      visibility,
      payload,
      ...(sourceEventIds && sourceEventIds.length > 0 ? { sourceEventIds } : {}),
      ...(thinker ? { thinker } : {}),
      ...(decider ? { decider } : {}),
      ...(experiencer ? { experiencer } : {}),
      ...(owner ? { owner } : {}),
    };
  });

  const stateChanges = asRecord(record.stateChanges);
  const metricsRaw = asRecord(record.metrics);
  const metrics: Record<string, number> = {};
  for (const [key, value] of Object.entries(metricsRaw)) {
    const numeric = toFiniteNumber(value);
    if (numeric != null) {
      metrics[key] = numeric;
    }
  }
  if (Object.keys(metrics).length === 0) {
    metrics.coherence = 0.6;
    metrics.groundedRatio = 0.6;
    metrics.tension = 0.5;
  }

  const candidate = {
    spineEvents: events,
    stateChanges,
    metrics,
  };
  const validation = NarrativeCoreOutputSchema.safeParse(candidate);
  if (!validation.success) {
    return null;
  }
  return validation.data as NarrativeCoreOutput;
}

function parseCoreOutput(text: string): NarrativeCoreOutput | null {
  const jsonText = extractJsonObjectText(text);
  const parsedDirect = tryParseJsonObject(jsonText);
  const parsedValue = parsedDirect ?? tryParseJsonObject(repairLikelyTruncatedJson(jsonText));
  if (!parsedValue) {
    return null;
  }
  const directValidation = NarrativeCoreOutputSchema.safeParse(parsedValue);
  if (directValidation.success) {
    return directValidation.data as NarrativeCoreOutput;
  }
  return coerceCoreOutput(parsedValue);
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
      maxTokens: 1600,
      temperature: 0.2,
      mode: 'SCENE_TURN',
    });

    let coreOutput = parseCoreOutput(response.text);
    if (!coreOutput) {
      const repairPrompt = buildRepairPrompt({
        turn: input.turn,
        previousRawOutput: response.text,
      });
      const repairedResponse = await input.generateText({
        prompt: repairPrompt,
        systemPrompt: 'Repair malformed JSON into valid CoreOutput. Return JSON only.',
        routeHint: input.turn.routeHint,
        routeOverride: asRecord(input.turn.routeOverride),
        worldId: input.turn.worldId,
        agentId: input.turn.agentId,
        maxTokens: 1000,
        temperature: 0.1,
        mode: 'SCENE_TURN',
      });
      coreOutput = parseCoreOutput(repairedResponse.text);
    }
    if (!coreOutput) {
      return {
        ok: false,
        reasonCode: NARRATIVE_REASON_CODES.NARRATIVE_GENERATION_SCHEMA_INVALID,
        actionHint: 'CoreOutput JSON invalid. Check schema contract and compile context budget.',
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
      actionHint: 'CoreOutput JSON invalid. Check schema contract and compile context budget.',
      value: null,
    };
  }
}
