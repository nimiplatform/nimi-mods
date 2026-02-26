import { asRecord, clamp01, toStringArray } from '@nimiplatform/sdk/mod/utils';
import type {
  ChunkExtraction,
  EventNodeDraft,
  EvidenceRefDraft,
  RouteCapabilityLlmInvoker,
} from './types.js';
import { buildRepairPrompt, parseJsonRecord, summarizeModelError } from './json-repair.js';
import { isSyntheticEntityName } from './errors.js';

const CHUNK_TIMELINE_MAX = 8;
const CHUNK_LOCATIONS_MAX = 10;
const CHUNK_CHARACTERS_MAX = 14;
const CHUNK_PRIMARY_EVENTS_MAX = 8;
const CHUNK_SECONDARY_EVENTS_MAX = 12;
const CHUNK_RELATIONS_MAX = 14;
const STRICT_REPAIR_OUTPUT_LIMIT = 1400;
const STRICT_REPAIR_SOURCE_LIMIT = 2200;

function normalizeEvidenceRefs(value: unknown): EvidenceRefDraft[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => {
      const record = asRecord(item);
      return {
        segmentId: String(record.segmentId || `segment-${index + 1}`),
        offsetStart: Number.isFinite(Number(record.offsetStart)) ? Number(record.offsetStart) : 0,
        offsetEnd: Number.isFinite(Number(record.offsetEnd)) ? Number(record.offsetEnd) : 0,
        excerpt: String(record.excerpt || '').trim(),
        confidence: clamp01(record.confidence, 0.6),
        sourceType: 'chunk' as const,
      };
    })
    .filter((item) => Boolean(item.segmentId));
}

function normalizeEvent(value: unknown, level: 'PRIMARY' | 'SECONDARY', index: number): EventNodeDraft {
  const record = asRecord(value);
  const title = String(record.title || record.name || `Event ${index + 1}`).trim();
  const evidenceRefs = normalizeEvidenceRefs(record.evidenceRefs);
  const normalizedLevel = String(record.level || level).trim().toUpperCase() === 'SECONDARY'
    ? 'SECONDARY'
    : 'PRIMARY';
  const temporalBeforeEventIds = toStringArray(record.temporalBeforeEventIds || record.beforeEventIds);
  const temporalAfterEventIds = toStringArray(record.temporalAfterEventIds || record.afterEventIds);
  const dependsOnEventIds = Array.from(new Set([
    ...toStringArray(record.dependsOnEventIds),
    ...temporalBeforeEventIds,
  ]));
  const temporalConfidence = Number(record.temporalConfidence);
  const normalizedTimeRef = String(record.timeRef || record.time || record.timelineAnchorLabel || '').trim();
  return {
    id: String(record.id || `${normalizedLevel.toLowerCase()}-${index + 1}`),
    level: normalizedLevel,
    parentEventId: String(record.parentEventId || '').trim() || null,
    title: title || `Event ${index + 1}`,
    summary: String(record.summary || record.description || '').trim(),
    cause: String(record.cause || '').trim(),
    process: String(record.process || '').trim(),
    result: String(record.result || '').trim(),
    timeRef: normalizedTimeRef,
    locationRefs: toStringArray(record.locationRefs || (record.locationRef ? [record.locationRef] : [])),
    characterRefs: toStringArray(record.characterRefs),
    dependsOnEventIds,
    ...(temporalBeforeEventIds.length > 0 ? { temporalBeforeEventIds } : {}),
    ...(temporalAfterEventIds.length > 0 ? { temporalAfterEventIds } : {}),
    ...(Number.isFinite(temporalConfidence) ? { temporalConfidence: clamp01(temporalConfidence, 0.6) } : {}),
    evidenceRefs,
    confidence: clamp01(record.confidence, 0.6),
    needsEvidence: normalizedLevel === 'PRIMARY' ? evidenceRefs.length === 0 : false,
  };
}

function normalizeChunkExtraction(raw: Record<string, unknown>): ChunkExtraction {
  const timeline = Array.isArray(raw.timeline) ? raw.timeline.slice(0, CHUNK_TIMELINE_MAX) : [];
  const locations = Array.isArray(raw.locations) ? raw.locations.slice(0, CHUNK_LOCATIONS_MAX) : [];
  const characters = Array.isArray(raw.characters) ? raw.characters.slice(0, CHUNK_CHARACTERS_MAX) : [];
  const relations = Array.isArray(raw.characterRelations)
    ? raw.characterRelations.slice(0, CHUNK_RELATIONS_MAX)
    : [];

  const eventsRoot = asRecord(raw.events);
  const primaryRaw = Array.isArray(eventsRoot.primary)
    ? eventsRoot.primary.slice(0, CHUNK_PRIMARY_EVENTS_MAX)
    : [];
  const secondaryRaw = Array.isArray(eventsRoot.secondary)
    ? eventsRoot.secondary.slice(0, CHUNK_SECONDARY_EVENTS_MAX)
    : [];

  return {
    worldSetting: String(raw.worldSetting || '').trim(),
    timeline: timeline.filter((item) => item && typeof item === 'object').map((item) => ({
      ...(item as Record<string, unknown>),
      weight: clamp01(asRecord(item).weight, 0.5),
    })),
    locations: locations.filter((item) => item && typeof item === 'object').map((item) => ({
      ...(item as Record<string, unknown>),
      importance: clamp01(asRecord(item).importance, 0.5),
    })),
    characters: characters
      .filter((item) => item && typeof item === 'object')
      .filter((item) => {
        const name = String(asRecord(item).name || '').trim();
        return name && !isSyntheticEntityName(name);
      })
      .map((item) => ({
        ...(item as Record<string, unknown>),
        significance: clamp01(asRecord(item).significance, 0.5),
      })),
    events: {
      primary: primaryRaw.map((item, index) => normalizeEvent(item, 'PRIMARY', index)),
      secondary: secondaryRaw.map((item, index) => normalizeEvent(item, 'SECONDARY', index)),
    },
    characterRelations: relations.filter((item) => item && typeof item === 'object').map((item) => ({
      ...(item as Record<string, unknown>),
      strength: clamp01(asRecord(item).strength, 0.5),
    })),
  };
}

function buildCoarsePrompt(input: { chunk: string; index: number; total: number; accumulatedContext?: string }): string {
  return [
    'You are a narrative distillation engine.',
    'Extract event-centric world knowledge from the source chunk below.',
    '',
    '## Language Rule',
    'Output ALL field values in the SAME language as the source text.',
    'If the source is Chinese, output Chinese. If English, output English. Never translate.',
    '',
    '## Entity Classification Rules',
    '- characters: Must be specifically named persons or entities with proper names.',
    '  Do NOT extract descriptive fragments, pronouns, titles without names, or partial sentences as character names.',
    '  Each character name must be a complete, proper name as it appears in the source text.',
    '- locations: Must be specifically named, identifiable places.',
    '  Do NOT extract directional words, vague references, or generic descriptions as location names.',
    '- events.primary: Must be significant events that have meaningful impact on the world or narrative.',
    '  Prefer fewer high-quality events over many trivial ones.',
    '- events.secondary: Supporting events linked to primary events via parentEventId.',
    '',
    ...(input.accumulatedContext ? [
      '## Accumulated Context (from previous chunks)',
      `Below is a compressed summary of all entities extracted so far (chunks 1 through ${input.index}).`,
      'Use this to:',
      '- Refer to characters by their ESTABLISHED names (do not create duplicates)',
      '- Update entity descriptions if this chunk provides newer or more accurate information',
      '- Build on the existing event timeline',
      '- If you recognize a character under a different name/alias, use the name from KNOWN_CHARACTERS',
      '- IMPORTANT: If this chunk describes an event that matches a KNOWN_EVENT, reuse that event\'s id (e.g. id="evt-p3") in your output instead of creating a new id. This enables proper event tracking across chunks.',
      '',
      input.accumulatedContext,
      '',
    ] : []),
    '## Reference Rules',
    '- characterRefs and locationRefs must use the entity NAME (e.g. "韩立"), never the entity ID (e.g. "char-1").',
    '- dependsOnEventIds must list prerequisite event IDs that happen earlier in timeline order.',
    '- beforeEventIds means event IDs that happen BEFORE current event (same direction as dependsOnEventIds).',
    '- afterEventIds means event IDs that happen AFTER current event.',
    '',
    '## Quality Constraints',
    '- If a field has no relevant content in this chunk, return an empty array. Do NOT fabricate entries.',
    '- Prefer precision over recall: it is better to miss an entity than to include a wrong one.',
    '- evidenceRefs.excerpt must be verbatim quotes from the source text.',
    '',
    'Return STRICT JSON only. No markdown, no commentary.',
    'Schema:',
    '{',
    '  "worldSetting": "string summary",',
    '  "timeline":[{"id":"t1","label":"...","description":"...","time":"...","weight":0.0}],',
    '  "locations":[{"id":"loc-1","name":"...","description":"...","importance":0.0}],',
    '  "characters":[{"id":"char-1","name":"...","summary":"...","significance":0.0}],',
    '  "events": {',
    '    "primary":[{"id":"evt-p1","title":"...","summary":"...","cause":"...","process":"...","result":"...","timeRef":"...","locationRefs":["..."],"characterRefs":["..."],"dependsOnEventIds":[],"beforeEventIds":[],"afterEventIds":[],"temporalConfidence":0.0,"evidenceRefs":[{"segmentId":"...","offsetStart":0,"offsetEnd":0,"excerpt":"...","confidence":0.0,"sourceType":"chunk"}],"confidence":0.0}],',
    '    "secondary":[{"id":"evt-s1","parentEventId":"evt-p1","title":"...","summary":"...","cause":"...","process":"...","result":"...","timeRef":"...","locationRefs":["..."],"characterRefs":["..."],"dependsOnEventIds":[],"beforeEventIds":[],"afterEventIds":[],"temporalConfidence":0.0,"evidenceRefs":[{"segmentId":"...","offsetStart":0,"offsetEnd":0,"excerpt":"...","confidence":0.0,"sourceType":"chunk"}],"confidence":0.0}]',
    '  },',
    '  "characterRelations":[{"source":"...","target":"...","relation":"...","reason":"...","strength":0.0}]',
    '}',
    `Limit timeline <= ${CHUNK_TIMELINE_MAX}, locations <= ${CHUNK_LOCATIONS_MAX}, characters <= ${CHUNK_CHARACTERS_MAX}, primary events <= ${CHUNK_PRIMARY_EVENTS_MAX}, secondary events <= ${CHUNK_SECONDARY_EVENTS_MAX}, relations <= ${CHUNK_RELATIONS_MAX}.`,
    'PRIMARY events must include at least one evidenceRefs item if possible.',
    `CHUNK_INDEX: ${input.index + 1}/${input.total}`,
    '<document_content>',
    input.chunk,
    '</document_content>',
  ].join('\n');
}

function buildCoarseSchemaLines(): string[] {
  return [
    '{',
    '  "worldSetting":"string summary",',
    '  "timeline":[{"id":"t1","label":"...","description":"...","time":"...","weight":0.0}],',
    '  "locations":[{"id":"loc-1","name":"...","description":"...","importance":0.0}],',
    '  "characters":[{"id":"char-1","name":"...","summary":"...","significance":0.0}],',
    '  "events":{"primary":[{"id":"evt-p1","title":"...","summary":"...","cause":"...","process":"...","result":"...","timeRef":"...","locationRefs":["..."],"characterRefs":["..."],"dependsOnEventIds":[],"beforeEventIds":[],"afterEventIds":[],"temporalConfidence":0.0,"evidenceRefs":[{"segmentId":"...","offsetStart":0,"offsetEnd":0,"excerpt":"...","confidence":0.0,"sourceType":"chunk"}],"confidence":0.0}],"secondary":[{"id":"evt-s1","parentEventId":"evt-p1","title":"...","summary":"...","cause":"...","process":"...","result":"...","timeRef":"...","locationRefs":["..."],"characterRefs":["..."],"dependsOnEventIds":[],"beforeEventIds":[],"afterEventIds":[],"temporalConfidence":0.0,"evidenceRefs":[{"segmentId":"...","offsetStart":0,"offsetEnd":0,"excerpt":"...","confidence":0.0,"sourceType":"chunk"}],"confidence":0.0}]},',
    '  "characterRelations":[{"source":"...","target":"...","relation":"...","reason":"...","strength":0.0}]',
    '}',
  ];
}

function truncateForStrictRepair(value: string, limit: number): string {
  const text = String(value || '');
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 3))}...`;
}

function buildStrictCoarseRepairPrompt(input: {
  schemaLines: string[];
  chunk: string;
  chunkIndex: number;
  chunkTotal: number;
  firstOutput: string;
  secondOutput: string;
  firstError: string;
  secondError: string;
}): string {
  return [
    'CRITICAL JSON REPAIR MODE.',
    'You must return exactly ONE valid JSON object and nothing else.',
    'If uncertain, keep arrays empty and strings empty, but JSON must be strictly valid.',
    'Do not use markdown fences, comments, trailing commas, or unquoted keys.',
    'Schema:',
    ...input.schemaLines,
    'Rules:',
    '- Output must start with { and end with }.',
    '- Keep required top-level keys: worldSetting, timeline, locations, characters, events, characterRelations.',
    '- events must include both primary and secondary arrays.',
    `CHUNK_INDEX: ${input.chunkIndex + 1}/${input.chunkTotal}`,
    `FIRST_PARSE_ERROR: ${input.firstError}`,
    `SECOND_PARSE_ERROR: ${input.secondError}`,
    'FIRST_INVALID_OUTPUT:',
    truncateForStrictRepair(input.firstOutput, STRICT_REPAIR_OUTPUT_LIMIT),
    'SECOND_INVALID_OUTPUT:',
    truncateForStrictRepair(input.secondOutput, STRICT_REPAIR_OUTPUT_LIMIT),
    'ORIGINAL_CHUNK_SOURCE:',
    truncateForStrictRepair(input.chunk, STRICT_REPAIR_SOURCE_LIMIT),
  ].join('\n');
}

export async function extractChunkCoarse(
  llm: RouteCapabilityLlmInvoker,
  input: { chunk: string; index: number; total: number; abortSignal?: AbortSignal; accumulatedContext?: string },
): Promise<{ extraction: ChunkExtraction; retryCount: number }> {
  const prompt = buildCoarsePrompt(input);
  const first = await llm.generateText({
    routeHint: 'chat/coarse',
    prompt,
    mode: 'STORY',
    abortSignal: input.abortSignal,
  });
  try {
    return {
      extraction: normalizeChunkExtraction(parseJsonRecord(first.text)),
      retryCount: 0,
    };
  } catch (firstError) {
    const repairPrompt = buildRepairPrompt({
      schemaLines: buildCoarseSchemaLines(),
      chunk: input.chunk,
      chunkIndex: input.index,
      chunkTotal: input.total,
      invalidOutput: String(first.text || ''),
      parseError: summarizeModelError(firstError),
    });
    const second = await llm.generateText({
      routeHint: 'chat/retry-low-temp',
      prompt: repairPrompt,
      mode: 'STORY',
      abortSignal: input.abortSignal,
    });
    try {
      return {
        extraction: normalizeChunkExtraction(parseJsonRecord(second.text)),
        retryCount: 1,
      };
    } catch (secondError) {
      const strictRepairPrompt = buildStrictCoarseRepairPrompt({
        schemaLines: buildCoarseSchemaLines(),
        chunk: input.chunk,
        chunkIndex: input.index,
        chunkTotal: input.total,
        firstOutput: String(first.text || ''),
        secondOutput: String(second.text || ''),
        firstError: summarizeModelError(firstError),
        secondError: summarizeModelError(secondError),
      });
      const third = await llm.generateText({
        routeHint: 'chat/retry-low-temp',
        prompt: strictRepairPrompt,
        mode: 'STORY',
        abortSignal: input.abortSignal,
      });
      try {
        return {
          extraction: normalizeChunkExtraction(parseJsonRecord(third.text)),
          retryCount: 2,
        };
      } catch (thirdError) {
        throw new Error(
          `WORLD_STUDIO_COARSE_JSON_PARSE_FAILED: ${summarizeModelError(firstError)} -> ${summarizeModelError(secondError)} -> ${summarizeModelError(thirdError)}`,
        );
      }
    }
  }
}
