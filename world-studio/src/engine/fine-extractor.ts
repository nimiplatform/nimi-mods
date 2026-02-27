import { asRecord, clamp01, toStringArray } from '@nimiplatform/sdk/mod/utils';
import type {
  ChunkExtraction,
  DraftPatch,
  EventNodeDraft,
  EvidenceRefDraft,
  RouteCapabilityLlmInvoker,
  WorldStudioAgentDraft,
  WorldStudioAgentLorebookDraft,
} from './types.js';
import { buildRepairPrompt, parseJsonRecord, summarizeModelError } from './json-repair.js';
import { isSyntheticEntityName } from './errors.js';

function normalizeEntityRefs(value: unknown): string[] {
  return Array.from(new Set(
    toStringArray(value)
      .map((item) => String(item || '').trim())
      .filter((item) => item.length > 0 && !isSyntheticEntityName(item)),
  ));
}

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
  const temporalBeforeEventIds = toStringArray(record.temporalBeforeEventIds || record.beforeEventIds);
  const temporalAfterEventIds = toStringArray(record.temporalAfterEventIds || record.afterEventIds);
  const dependsOnEventIds = Array.from(new Set([
    ...toStringArray(record.dependsOnEventIds),
    ...temporalBeforeEventIds,
  ]));
  const temporalConfidence = Number(record.temporalConfidence);
  return {
    id: String(record.id || `${normalizedLevel.toLowerCase()}-${index + 1}`),
    level: normalizedLevel,
    parentEventId: String(record.parentEventId || '').trim() || null,
    title: String(record.title || record.name || `Event ${index + 1}`).trim(),
    summary: String(record.summary || record.description || '').trim(),
    cause: String(record.cause || '').trim(),
    process: String(record.process || '').trim(),
    result: String(record.result || '').trim(),
    timeRef: String(record.timeRef || record.time || record.timelineAnchorLabel || '').trim(),
    locationRefs: normalizeEntityRefs(record.locationRefs || (record.locationRef ? [record.locationRef] : [])),
    characterRefs: normalizeEntityRefs(record.characterRefs),
    dependsOnEventIds,
    ...(temporalBeforeEventIds.length > 0 ? { temporalBeforeEventIds } : {}),
    ...(temporalAfterEventIds.length > 0 ? { temporalAfterEventIds } : {}),
    ...(Number.isFinite(temporalConfidence) ? { temporalConfidence: clamp01(temporalConfidence, 0.6) } : {}),
    evidenceRefs,
    confidence: clamp01(record.confidence, 0.6),
    needsEvidence: normalizedLevel === 'PRIMARY' ? evidenceRefs.length === 0 : false,
  };
}

function normalizeFineExtraction(raw: Record<string, unknown>): ChunkExtraction {
  const extractionRoot = (() => {
    const nested = asRecord(raw.extraction);
    return Object.keys(nested).length > 0 ? nested : raw;
  })();
  const eventsRoot = asRecord(extractionRoot.events);
  const primaryRaw = Array.isArray(eventsRoot.primary) ? eventsRoot.primary : [];
  const secondaryRaw = Array.isArray(eventsRoot.secondary) ? eventsRoot.secondary : [];
  return {
    worldSetting: String(extractionRoot.worldSetting || '').trim(),
    timeline: Array.isArray(extractionRoot.timeline)
      ? extractionRoot.timeline.filter((item) => item && typeof item === 'object') as Array<Record<string, unknown>>
      : [],
    locations: Array.isArray(extractionRoot.locations)
      ? extractionRoot.locations.filter((item) => item && typeof item === 'object') as Array<Record<string, unknown>>
      : [],
    characters: Array.isArray(extractionRoot.characters)
      ? extractionRoot.characters
        .filter((item) => item && typeof item === 'object')
        .filter((item) => {
          const name = String(asRecord(item).name || '').trim();
          return name.length > 0 && !isSyntheticEntityName(name);
        }) as Array<Record<string, unknown>>
      : [],
    events: {
      primary: primaryRaw.map((item, index) => normalizeEvent(item, 'PRIMARY', index)),
      secondary: secondaryRaw.map((item, index) => normalizeEvent(item, 'SECONDARY', index)),
    },
    characterRelations: Array.isArray(extractionRoot.characterRelations)
      ? extractionRoot.characterRelations.filter((item) => item && typeof item === 'object') as Array<Record<string, unknown>>
      : [],
  };
}

function normalizeNullableString(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value || '').trim();
  return text.length > 0 ? text : null;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function normalizeAgentRules(value: unknown): WorldStudioAgentDraft['rules'] | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = asRecord(value);
  if (String(record.format || '').trim() !== 'rule-lines-v1') return undefined;
  const lines = normalizeStringArray(record.lines);
  return {
    format: 'rule-lines-v1',
    lines,
    text: lines.join('\n'),
  };
}

function normalizeAgentDraftPatch(value: unknown): WorldStudioAgentDraft | null {
  if (!value || typeof value !== 'object') return null;
  const record = asRecord(value);
  const characterName = String(record.characterName || '').trim();
  if (!characterName) return null;
  const normalizedRules = normalizeAgentRules(record.rules);
  const normalizeAgentLorebooks = (input: unknown): WorldStudioAgentLorebookDraft[] => {
    if (!Array.isArray(input)) return [];
    return input
      .filter((item) => item && typeof item === 'object')
      .map((item) => {
        const lorebook = asRecord(item);
        return {
          name: String(lorebook.name || '').trim(),
          content: String(lorebook.content || '').trim(),
          keywords: normalizeStringArray(lorebook.keywords),
          ...(Number.isFinite(Number(lorebook.priority))
            ? { priority: Number(lorebook.priority) }
            : {}),
          ...(Number.isFinite(Number(lorebook.insertionOrder))
            ? { insertionOrder: Number(lorebook.insertionOrder) }
            : {}),
          ...(typeof lorebook.constant === 'boolean' ? { constant: lorebook.constant } : {}),
          ...(typeof lorebook.selective === 'boolean' ? { selective: lorebook.selective } : {}),
          ...(Array.isArray(lorebook.secondaryKeys)
            ? { secondaryKeys: normalizeStringArray(lorebook.secondaryKeys) }
            : {}),
          ...(typeof lorebook.enabled === 'boolean' ? { enabled: lorebook.enabled } : {}),
          ...(typeof lorebook.source === 'string' ? { source: lorebook.source } : {}),
        } satisfies WorldStudioAgentLorebookDraft;
      })
      .filter((item) => Boolean(item.name || item.content));
  };
  return {
    characterName,
    handle: String(record.handle || '').trim(),
    concept: String(record.concept || '').trim(),
    backstory: String(record.backstory || '').trim(),
    coreValues: String(record.coreValues || '').trim(),
    relationshipStyle: String(record.relationshipStyle || '').trim(),
    ...(Object.prototype.hasOwnProperty.call(record, 'description')
      ? { description: normalizeNullableString(record.description) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(record, 'scenario')
      ? { scenario: normalizeNullableString(record.scenario) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(record, 'greeting')
      ? { greeting: normalizeNullableString(record.greeting) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(record, 'exampleDialogue')
      ? { exampleDialogue: normalizeNullableString(record.exampleDialogue) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(record, 'systemPromptBase')
      ? { systemPromptBase: normalizeNullableString(record.systemPromptBase) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(record, 'rules') && normalizedRules
      ? { rules: normalizedRules }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(record, 'postHistoryInstructions')
      ? { postHistoryInstructions: normalizeNullableString(record.postHistoryInstructions) }
      : {}),
    ...(Array.isArray(record.alternateGreetings)
      ? { alternateGreetings: normalizeStringArray(record.alternateGreetings) }
      : {}),
    ...(Array.isArray(record.agentLorebooks)
      ? {
        agentLorebooks: normalizeAgentLorebooks(record.agentLorebooks),
      }
      : {}),
    ...(record.dna && typeof record.dna === 'object' && !Array.isArray(record.dna)
      ? { dna: record.dna as WorldStudioAgentDraft['dna'] }
      : {}),
  };
}

function normalizeDraftPatch(raw: Record<string, unknown>, chunkIndex: number): DraftPatch {
  const patchRoot = (() => {
    const nested = asRecord(raw.draftPatch);
    if (Object.keys(nested).length > 0) return nested;
    return raw;
  })();

  const patch: DraftPatch = { chunkIndex };
  const world = asRecord(patchRoot.world);
  if (Object.keys(world).length > 0) patch.world = world;
  const worldview = asRecord(patchRoot.worldview);
  if (Object.keys(worldview).length > 0) patch.worldview = worldview;

  if (Array.isArray(patchRoot.worldLorebooks)) {
    patch.worldLorebooks = patchRoot.worldLorebooks
      .filter((item) => item && typeof item === 'object')
      .map((item) => asRecord(item));
  }
  if (Array.isArray(patchRoot.futureHistoricalEvents)) {
    patch.futureHistoricalEvents = patchRoot.futureHistoricalEvents
      .filter((item) => item && typeof item === 'object')
      .map((item) => asRecord(item));
  }
  if (Array.isArray(patchRoot.agentDrafts)) {
    patch.agentDrafts = patchRoot.agentDrafts
      .map((item) => normalizeAgentDraftPatch(item))
      .filter((item): item is WorldStudioAgentDraft => Boolean(item));
  }
  if (Array.isArray(patchRoot.evidenceRefs)) {
    patch.evidenceRefs = patchRoot.evidenceRefs
      .filter((item) => item && typeof item === 'object')
      .map((item) => {
        const record = asRecord(item);
        return {
          fieldPath: String(record.fieldPath || '').trim(),
          ...(typeof record.segmentId === 'string' ? { segmentId: record.segmentId } : {}),
          ...(typeof record.eventId === 'string' ? { eventId: record.eventId } : {}),
          ...(Number.isFinite(Number(record.confidence)) ? { confidence: Number(record.confidence) } : {}),
        };
      })
      .filter((item) => Boolean(item.fieldPath));
  }
  if (Array.isArray(patchRoot.notes)) {
    patch.notes = patchRoot.notes
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }
  return patch;
}

function buildFinePrompt(input: {
  chunk: string;
  index: number;
  total: number;
  seed?: ChunkExtraction;
  accumulatedContext?: string;
  accumulatorSlice?: Record<string, unknown>;
  missingFields?: string[];
}): string {
  const focusTargets: string[] = [];
  if (!input.seed || input.seed.events.primary.length === 0) {
    focusTargets.push('PRIMARY events with explicit cause/process/result and evidenceRefs.');
  }
  if (!input.seed || input.seed.events.secondary.length === 0) {
    focusTargets.push('SECONDARY events linked to PRIMARY via parentEventId.');
  }
  if (!input.seed || input.seed.characters.length === 0) {
    focusTargets.push('character entities and participation evidence.');
  }
  const focusLine = focusTargets.length > 0
    ? `Focus targets: ${focusTargets.join(' ')}`
    : 'Focus targets: refine links and patch missing target fields.';
  const missingFieldLine = input.missingFields && input.missingFields.length > 0
    ? `Missing target fields to prioritize: ${input.missingFields.join(', ')}`
    : 'Missing target fields to prioritize: none';

  return [
    'You are a fine-grained extraction and draft-patch engine.',
    'For this chunk, produce BOTH: (1) extraction delta for knowledge graph, (2) draftPatch for final world/agent outputs.',
    '',
    'Rules:',
    '- Output STRICT JSON only (no markdown).',
    '- Do not fabricate facts; if evidence is insufficient keep fields empty/null/[] or omit optional parts.',
    '- Keep all names/content in source language.',
    '- draftPatch can be partial; only include fields supported by this chunk evidence.',
    '- dependsOnEventIds should encode temporal prerequisites (events that happen earlier).',
    '- beforeEventIds means event IDs that happen BEFORE current event (same direction as dependsOnEventIds).',
    '- afterEventIds means event IDs that happen AFTER current event.',
    '',
    'Top-level schema:',
    '{',
    '  "extraction": {"worldSetting":"","timeline":[],"locations":[],"characters":[],"events":{"primary":[],"secondary":[]},"characterRelations":[]},',
    '  "draftPatch": {"world":{},"worldview":{},"worldLorebooks":[],"futureHistoricalEvents":[],"agentDrafts":[],"evidenceRefs":[],"notes":[]}',
    '}',
    '',
    'Extraction event item schema:',
    '{"id":"...","title":"...","summary":"...","cause":"...","process":"...","result":"...","timeRef":"...","locationRefs":[],"characterRefs":[],"dependsOnEventIds":[],"beforeEventIds":[],"afterEventIds":[],"temporalConfidence":0.0,"evidenceRefs":[{"segmentId":"...","offsetStart":0,"offsetEnd":0,"excerpt":"...","confidence":0.0,"sourceType":"chunk"}],"confidence":0.0}',
    '',
    'Agent draft patch schema (partial allowed):',
    '{"characterName":"...","handle":"","concept":"","backstory":"","coreValues":"","relationshipStyle":"","description":"","scenario":"","greeting":"","exampleDialogue":"","systemPromptBase":"","rules":{"format":"rule-lines-v1","lines":[],"text":""},"postHistoryInstructions":"","alternateGreetings":[],"agentLorebooks":[],"dna":{}}',
    '',
    focusLine,
    missingFieldLine,
    `CHUNK_INDEX: ${input.index + 1}/${input.total}`,
    'CURRENT_COARSE_RESULT:',
    JSON.stringify(input.seed || {}),
    ...(input.accumulatedContext
      ? [
        'ACCUMULATED_FACT_CONTEXT:',
        input.accumulatedContext,
      ]
      : []),
    ...(input.accumulatorSlice
      ? [
        'CURRENT_ACCUMULATOR_SLICE:',
        JSON.stringify(input.accumulatorSlice),
      ]
      : []),
    '<document_content>',
    input.chunk,
    '</document_content>',
  ].join('\n');
}

function buildFineSchemaLines(): string[] {
  return [
    '{',
    '  "extraction":{"worldSetting":"string summary","timeline":[],"locations":[],"characters":[],"events":{"primary":[],"secondary":[]},"characterRelations":[]},',
    '  "draftPatch":{"world":{},"worldview":{},"worldLorebooks":[],"futureHistoricalEvents":[],"agentDrafts":[],"evidenceRefs":[],"notes":[]}',
    '}',
  ];
}

function parseFineOutput(raw: Record<string, unknown>, chunkIndex: number): { extraction: ChunkExtraction; draftPatch: DraftPatch } {
  return {
    extraction: normalizeFineExtraction(raw),
    draftPatch: normalizeDraftPatch(raw, chunkIndex),
  };
}

export async function extractChunkFine(
  llm: RouteCapabilityLlmInvoker,
  input: {
    chunk: string;
    index: number;
    total: number;
    seed?: ChunkExtraction;
    accumulatedContext?: string;
    accumulatorSlice?: Record<string, unknown>;
    missingFields?: string[];
    abortSignal?: AbortSignal;
  },
): Promise<{ extraction: ChunkExtraction; draftPatch: DraftPatch; retryCount: number }> {
  const prompt = buildFinePrompt(input);
  const first = await llm.generateText({
    routeHint: 'chat/fine',
    prompt,
    mode: 'STORY',
    abortSignal: input.abortSignal,
  });
  try {
    return {
      ...parseFineOutput(parseJsonRecord(first.text), input.index),
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
        ...parseFineOutput(parseJsonRecord(second.text), input.index),
        retryCount: 1,
      };
    } catch (secondError) {
      throw new Error(
        `WORLD_STUDIO_FINE_JSON_PARSE_FAILED: ${summarizeModelError(firstError)} -> ${summarizeModelError(secondError)}`,
      );
    }
  }
}
