import { asRecord, clamp01, toStringArray } from '@nimiplatform/mod-sdk/utils';
import type { ChunkExtraction, EventNodeDraft, EvidenceRefDraft, RouteCapabilityLlmInvoker } from './types.js';
import { buildRepairPrompt, parseJsonRecord, summarizeModelError } from './json-repair.js';

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
  const evidenceRefs = normalizeEvidenceRefs(record.evidenceRefs);
  const normalizedLevel = String(record.level || level).trim().toUpperCase() === 'SECONDARY'
    ? 'SECONDARY'
    : 'PRIMARY';
  return {
    id: String(record.id || `${normalizedLevel.toLowerCase()}-${index + 1}`),
    level: normalizedLevel,
    parentEventId: String(record.parentEventId || '').trim() || null,
    title: String(record.title || record.name || `Event ${index + 1}`).trim(),
    summary: String(record.summary || record.description || '').trim(),
    cause: String(record.cause || '').trim(),
    process: String(record.process || '').trim(),
    result: String(record.result || '').trim(),
    timeRef: String(record.timeRef || record.time || '').trim(),
    locationRefs: toStringArray(record.locationRefs || (record.locationRef ? [record.locationRef] : [])),
    characterRefs: toStringArray(record.characterRefs),
    dependsOnEventIds: toStringArray(record.dependsOnEventIds),
    evidenceRefs,
    confidence: clamp01(record.confidence, 0.6),
    needsEvidence: normalizedLevel === 'PRIMARY' ? evidenceRefs.length === 0 : false,
  };
}

function normalizeFineExtraction(raw: Record<string, unknown>): ChunkExtraction {
  const eventsRoot = asRecord(raw.events);
  const primaryRaw = Array.isArray(eventsRoot.primary) ? eventsRoot.primary : [];
  const secondaryRaw = Array.isArray(eventsRoot.secondary) ? eventsRoot.secondary : [];
  return {
    worldSetting: String(raw.worldSetting || '').trim(),
    timeline: Array.isArray(raw.timeline)
      ? raw.timeline.filter((item) => item && typeof item === 'object') as Array<Record<string, unknown>>
      : [],
    locations: Array.isArray(raw.locations)
      ? raw.locations.filter((item) => item && typeof item === 'object') as Array<Record<string, unknown>>
      : [],
    characters: Array.isArray(raw.characters)
      ? raw.characters.filter((item) => item && typeof item === 'object') as Array<Record<string, unknown>>
      : [],
    events: {
      primary: primaryRaw.map((item, index) => normalizeEvent(item, 'PRIMARY', index)),
      secondary: secondaryRaw.map((item, index) => normalizeEvent(item, 'SECONDARY', index)),
    },
    characterRelations: Array.isArray(raw.characterRelations)
      ? raw.characterRelations.filter((item) => item && typeof item === 'object') as Array<Record<string, unknown>>
      : [],
  };
}

function buildFinePrompt(input: {
  chunk: string;
  index: number;
  total: number;
  seed?: ChunkExtraction;
}): string {
  const seed = input.seed;
  const focusTargets: string[] = [];
  if (!seed || seed.events.primary.length === 0) {
    focusTargets.push('PRIMARY events with explicit cause/process/result and evidenceRefs.');
  }
  if (!seed || seed.events.secondary.length === 0) {
    focusTargets.push('SECONDARY events linked to PRIMARY via parentEventId.');
  }
  if (!seed || seed.characters.length === 0) {
    focusTargets.push('character entities and their event participation.');
  }
  if (!seed || seed.locations.length === 0) {
    focusTargets.push('location entities tied to events.');
  }
  if (!seed || seed.characterRelations.length === 0) {
    focusTargets.push('characterRelations inferred from co-occurrence and causality.');
  }
  const focusLine = focusTargets.length > 0
    ? `Focus targets: ${focusTargets.join(' ')}`
    : 'Focus targets: enrich sparse fields and improve evidence quality.';

  return [
    'You are a fine-grained event extraction engine.',
    'Focus on event evidence and missing links between events/characters/locations.',
    '',
    '## Language Rule',
    'Output ALL field values in the SAME language as the source text.',
    'If the source is Chinese, output Chinese. If English, output English. Never translate.',
    '',
    '## Entity Classification Rules',
    '- characters: Must be specifically named persons or entities with proper names.',
    '  Do NOT extract descriptive fragments, pronouns, or partial sentences as character names.',
    '- locations: Must be specifically named, identifiable places. No vague references.',
    '- events.primary: Must be significant events with meaningful narrative impact.',
    '- Prefer precision over recall: it is better to miss an entity than to include a wrong one.',
    '- If a field has no relevant content, return an empty array. Do NOT fabricate entries.',
    '',
    'Return STRICT JSON only. No markdown, no commentary.',
    'Schema:',
    '{',
    '  "worldSetting":"string summary",',
    '  "timeline":[{"id":"...","label":"...","description":"...","time":"...","weight":0.0}],',
    '  "locations":[{"id":"...","name":"...","description":"...","importance":0.0}],',
    '  "characters":[{"id":"...","name":"...","summary":"...","significance":0.0}],',
    '  "events":{',
    '    "primary":[{"id":"...","title":"...","summary":"...","cause":"...","process":"...","result":"...","timeRef":"...","locationRefs":["..."],"characterRefs":["..."],"dependsOnEventIds":[],"evidenceRefs":[{"segmentId":"...","offsetStart":0,"offsetEnd":0,"excerpt":"...","confidence":0.0,"sourceType":"chunk"}],"confidence":0.0}],',
    '    "secondary":[{"id":"...","parentEventId":"...","title":"...","summary":"...","cause":"...","process":"...","result":"...","timeRef":"...","locationRefs":["..."],"characterRefs":["..."],"dependsOnEventIds":[],"evidenceRefs":[{"segmentId":"...","offsetStart":0,"offsetEnd":0,"excerpt":"...","confidence":0.0,"sourceType":"chunk"}],"confidence":0.0}]',
    '  },',
    '  "characterRelations":[{"source":"...","target":"...","relation":"...","reason":"...","strength":0.0}]',
    '}',
    focusLine,
    'PRIMARY events must include evidenceRefs when source excerpt is available.',
    `CHUNK_INDEX: ${input.index + 1}/${input.total}`,
    'CURRENT_COARSE_RESULT:',
    JSON.stringify(input.seed || {}),
    '<document_content>',
    input.chunk,
    '</document_content>',
  ].join('\n');
}

function buildFineSchemaLines(): string[] {
  return [
    '{',
    '  "worldSetting":"string summary",',
    '  "timeline":[{"id":"...","label":"...","description":"...","time":"...","weight":0.0}],',
    '  "locations":[{"id":"...","name":"...","description":"...","importance":0.0}],',
    '  "characters":[{"id":"...","name":"...","summary":"...","significance":0.0}],',
    '  "events":{"primary":[{"id":"...","title":"...","summary":"...","cause":"...","process":"...","result":"...","timeRef":"...","locationRefs":["..."],"characterRefs":["..."],"dependsOnEventIds":[],"evidenceRefs":[{"segmentId":"...","offsetStart":0,"offsetEnd":0,"excerpt":"...","confidence":0.0,"sourceType":"chunk"}],"confidence":0.0}],"secondary":[{"id":"...","parentEventId":"...","title":"...","summary":"...","cause":"...","process":"...","result":"...","timeRef":"...","locationRefs":["..."],"characterRefs":["..."],"dependsOnEventIds":[],"evidenceRefs":[{"segmentId":"...","offsetStart":0,"offsetEnd":0,"excerpt":"...","confidence":0.0,"sourceType":"chunk"}],"confidence":0.0}]},',
    '  "characterRelations":[{"source":"...","target":"...","relation":"...","reason":"...","strength":0.0}]',
    '}',
  ];
}

export async function extractChunkFine(
  llm: RouteCapabilityLlmInvoker,
  input: {
    chunk: string;
    index: number;
    total: number;
    seed?: ChunkExtraction;
    abortSignal?: AbortSignal;
  },
): Promise<{ extraction: ChunkExtraction; retryCount: number }> {
  const prompt = buildFinePrompt(input);
  const first = await llm.generateText({
    routeHint: 'chat/fine',
    prompt,
    mode: 'STORY',
    abortSignal: input.abortSignal,
  });
  try {
    return {
      extraction: normalizeFineExtraction(parseJsonRecord(first.text)),
      retryCount: 0,
    };
  } catch (firstError) {
    const repairPrompt = buildRepairPrompt({
      schemaLines: buildFineSchemaLines(),
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
        extraction: normalizeFineExtraction(parseJsonRecord(second.text)),
        retryCount: 1,
      };
    } catch (secondError) {
      throw new Error(
        `WORLD_STUDIO_FINE_JSON_PARSE_FAILED: ${summarizeModelError(firstError)} -> ${summarizeModelError(secondError)}`,
      );
    }
  }
}
