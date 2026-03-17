import type {
  AgentProseCandidateField,
  ChunkExtraction,
  DraftPatch,
  EventNodeDraft,
  EvidenceRefDraft,
  ProsePatchDraft,
  RouteCapabilityLlmInvoker,
  WorldProseCandidateField,
  WorldStudioAgentDraft,
  WorldStudioAgentLorebookDraft,
} from './types.js';
import { buildRepairPrompt, parseJsonRecord, summarizeModelError } from './json-repair.js';
import { isRetryableChunkError, isSyntheticEntityName } from './errors.js';
import { emitWorldStudioDiag } from '../logging.js';
import { deriveNeedsEvidence, normalizeEventHorizon } from '../services/event-horizon.js';
import {
  AGENT_PROSE_FIELDS,
  WORLD_PROSE_FIELDS,
  alignAgentStructuralDraft,
  alignWorldPatch,
  alignWorldviewPatch,
} from './realm-alignment.js';
import { asRecord, clamp01, toStringArray } from "@nimiplatform/sdk/mod";

function diagLog(event: string, details?: Record<string, unknown>) {
  try {
    emitWorldStudioDiag({
      stage: 'fine',
      event,
      level: 'debug',
      source: 'world-studio.engine.fine-extractor',
      details,
    });
  } catch {
    // Ignore diagnostics sink failures in non-runtime environments.
  }
}

function normalizeEntityRefs(value: unknown): string[] {
  return Array.from(new Set(toStringArray(value)
    .map((item) => String(item || '').trim())
    .filter((item) => item.length > 0 && !isSyntheticEntityName(item))));
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
  const eventHorizon = normalizeEventHorizon(record.eventHorizon, 'PAST');
  const temporalBeforeEventIds = toStringArray(record.temporalBeforeEventIds || record.beforeEventIds);
  const temporalAfterEventIds = toStringArray(record.temporalAfterEventIds || record.afterEventIds);
  const dependsOnEventIds = Array.from(new Set([
    ...toStringArray(record.dependsOnEventIds),
    ...temporalBeforeEventIds,
  ]));
  const temporalConfidence = Number(record.temporalConfidence);
  return {
    id: String(record.id || `${normalizedLevel.toLowerCase()}-${index + 1}`),
    ...(Number.isFinite(Number(record.timelineSeq))
      ? { timelineSeq: Math.max(1, Math.trunc(Number(record.timelineSeq))) }
      : {}),
    level: normalizedLevel,
    eventHorizon,
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
    needsEvidence: deriveNeedsEvidence({
      level: normalizedLevel,
      eventHorizon,
      evidenceRefs,
      needsEvidence: record.needsEvidence,
    }),
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
  return value.map((item) => String(item || '').trim()).filter(Boolean);
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
          ...(Number.isFinite(Number(lorebook.priority)) ? { priority: Number(lorebook.priority) } : {}),
          ...(Number.isFinite(Number(lorebook.insertionOrder)) ? { insertionOrder: Number(lorebook.insertionOrder) } : {}),
          ...(typeof lorebook.constant === 'boolean' ? { constant: lorebook.constant } : {}),
          ...(typeof lorebook.selective === 'boolean' ? { selective: lorebook.selective } : {}),
          ...(Array.isArray(lorebook.secondaryKeys) ? { secondaryKeys: normalizeStringArray(lorebook.secondaryKeys) } : {}),
          ...(typeof lorebook.enabled === 'boolean' ? { enabled: lorebook.enabled } : {}),
          ...(typeof lorebook.source === 'string' ? { source: lorebook.source } : {}),
        } satisfies WorldStudioAgentLorebookDraft;
      })
      .filter((item) => Boolean(item.name || item.content));
  };
  return alignAgentStructuralDraft({
    characterName,
    handle: String(record.handle || '').trim(),
    concept: String(record.concept || '').trim(),
    backstory: String(record.backstory || '').trim(),
    coreValues: String(record.coreValues || '').trim(),
    relationshipStyle: String(record.relationshipStyle || '').trim(),
    ...(Object.prototype.hasOwnProperty.call(record, 'description')
      ? { description: normalizeNullableString(record.description) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(record, 'rules') && normalizedRules ? { rules: normalizedRules } : {}),
    ...(Object.prototype.hasOwnProperty.call(record, 'postHistoryInstructions')
      ? { postHistoryInstructions: normalizeNullableString(record.postHistoryInstructions) }
      : {}),
    ...(Array.isArray(record.alternateGreetings) ? { alternateGreetings: normalizeStringArray(record.alternateGreetings) } : {}),
    ...(Array.isArray(record.agentLorebooks) ? { agentLorebooks: normalizeAgentLorebooks(record.agentLorebooks) } : {}),
    ...(typeof record.referenceImageUrl === 'string' ? { referenceImageUrl: normalizeNullableString(record.referenceImageUrl) } : {}),
    ...(record.wakeStrategy === 'PASSIVE' || record.wakeStrategy === 'PROACTIVE' ? { wakeStrategy: record.wakeStrategy } : {}),
    ...(typeof record.dnaPrimary === 'string' ? { dnaPrimary: record.dnaPrimary } : {}),
    ...(Array.isArray(record.dnaSecondary) ? { dnaSecondary: record.dnaSecondary.map((item) => String(item || '')).filter(Boolean) } : {}),
    ...(record.dna && typeof record.dna === 'object' && !Array.isArray(record.dna) ? { dna: record.dna as WorldStudioAgentDraft['dna'] } : {}),
  });
}

function normalizeProsePatchValue(value: unknown): ProsePatchDraft | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = asRecord(value);
  const content = String(record.content || '').trim();
  if (!content) return null;
  return {
    content,
    confidence: clamp01(record.confidence, 0.5),
    ...(Array.isArray(record.evidenceRefs)
      ? {
          evidenceRefs: record.evidenceRefs
            .filter((item) => item && typeof item === 'object')
            .map((item) => {
              const evidence = asRecord(item);
              return {
                fieldPath: String(evidence.fieldPath || '').trim(),
                ...(typeof evidence.segmentId === 'string' ? { segmentId: evidence.segmentId } : {}),
                ...(typeof evidence.eventId === 'string' ? { eventId: evidence.eventId } : {}),
                ...(Number.isFinite(Number(evidence.confidence)) ? { confidence: Number(evidence.confidence) } : {}),
              };
            })
            .filter((item) => Boolean(item.fieldPath)),
        }
      : {}),
  };
}

function normalizeDraftPatch(raw: Record<string, unknown>, chunkIndex: number): DraftPatch {
  const patchRoot = (() => {
    const nested = asRecord(raw.draftPatch);
    return Object.keys(nested).length > 0 ? nested : raw;
  })();
  const patch: DraftPatch = { chunkIndex };
  const world = alignWorldPatch(patchRoot.world);
  if (Object.keys(world).length > 0) patch.world = world;
  const worldview = alignWorldviewPatch(patchRoot.worldview);
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
  const worldProse = WORLD_PROSE_FIELDS.reduce<Partial<Record<WorldProseCandidateField, ProsePatchDraft>>>((acc, field) => {
    const normalized = normalizeProsePatchValue(asRecord(patchRoot.worldProse)[field]);
    if (normalized) {
      acc[field] = normalized;
    }
    return acc;
  }, {});
  const agentProse = Object.entries(asRecord(patchRoot.agentProse)).reduce<Record<string, Partial<Record<AgentProseCandidateField, ProsePatchDraft>>>>((acc, [characterName, rawFields]) => {
    const normalizedName = String(characterName || '').trim();
    if (!normalizedName) return acc;
    const fieldsRecord = asRecord(rawFields);
    const nextFields = AGENT_PROSE_FIELDS.reduce<Partial<Record<AgentProseCandidateField, ProsePatchDraft>>>((fieldAcc, field) => {
      const normalized = normalizeProsePatchValue(fieldsRecord[field]);
      if (normalized) {
        fieldAcc[field] = normalized;
      }
      return fieldAcc;
    }, {});
    if (Object.keys(nextFields).length > 0) {
      acc[normalizedName] = nextFields;
    }
    return acc;
  }, {});
  if (Object.keys(worldProse).length > 0) patch.worldProse = worldProse;
  if (Object.keys(agentProse).length > 0) patch.agentProse = agentProse;
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
    patch.notes = patchRoot.notes.map((item) => String(item || '').trim()).filter(Boolean);
  }
  return patch;
}

function summarizeExtractionCounts(extraction: ChunkExtraction): Record<string, unknown> {
  return {
    timeline: extraction.timeline.length,
    locations: extraction.locations.length,
    characters: extraction.characters.length,
    primaryEvents: extraction.events.primary.length,
    secondaryEvents: extraction.events.secondary.length,
    characterRelations: extraction.characterRelations.length,
  };
}

function summarizeDraftPatchCounts(patch: DraftPatch): Record<string, unknown> {
  const worldProseCount = WORLD_PROSE_FIELDS.reduce((count, field) => count + (patch.worldProse?.[field] ? 1 : 0), 0);
  const agentProseCount = Object.values(patch.agentProse || {}).reduce((count, fields) => (
    count + AGENT_PROSE_FIELDS.reduce((fieldCount, field) => fieldCount + (fields[field] ? 1 : 0), 0)
  ), 0);
  return {
    worldKeys: Object.keys(asRecord(patch.world || {})).length,
    worldviewKeys: Object.keys(asRecord(patch.worldview || {})).length,
    worldLorebooks: Array.isArray(patch.worldLorebooks) ? patch.worldLorebooks.length : 0,
    futureHistoricalEvents: Array.isArray(patch.futureHistoricalEvents) ? patch.futureHistoricalEvents.length : 0,
    agentDrafts: Array.isArray(patch.agentDrafts) ? patch.agentDrafts.length : 0,
    worldProse: worldProseCount,
    agentProse: agentProseCount,
    evidenceRefs: Array.isArray(patch.evidenceRefs) ? patch.evidenceRefs.length : 0,
    notes: Array.isArray(patch.notes) ? patch.notes.length : 0,
  };
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
    focusTargets.push('PRIMARY events with explicit cause/process/result, explicit eventHorizon, and evidenceRefs when non-FUTURE.');
  }
  if (!input.seed || input.seed.events.secondary.length === 0) {
    focusTargets.push('SECONDARY events linked to PRIMARY via parentEventId.');
  }
  if (!input.seed || input.seed.characters.length === 0) {
    focusTargets.push('character entities and participation evidence.');
  }
  const focusLine = focusTargets.length > 0
    ? `Focus targets: ${focusTargets.join(' ')}`
    : 'Focus targets: refine links, patch missing structural fields, and emit prose edit deltas only when evidence is strong.';
  const missingFieldLine = input.missingFields && input.missingFields.length > 0
    ? `Missing target fields to prioritize: ${input.missingFields.join(', ')}`
    : 'Missing target fields to prioritize: none';
  return [
    'You are a fine-grained extraction and delta-edit engine.',
    'For this chunk, produce BOTH: (1) extraction delta for knowledge graph, and (2) draftPatch for structural world/agent data plus optional prose edit deltas.',
    '',
    'Rules:',
    '- Output STRICT JSON only (no markdown).',
    '- Do not fabricate facts; if evidence is insufficient keep fields empty/null/[] or omit optional parts.',
    '- Keep all names/content in source language.',
    '- draftPatch can be partial; only include fields supported by this chunk evidence.',
    '- worldProse/agentProse are optional edit deltas; emit them only when the chunk clearly improves a prose field.',
    '- Prose fields are editor deltas, not chunk-level full rewrites.',
    '- Do NOT try to complete the whole draft from this chunk.',
    '- Unmentioned fields mean no-op.',
    '- characters[].name must be proper names from source text, never placeholder labels.',
    '- characterRefs/locationRefs must use entity names from source text, never schema IDs.',
    '- extraction.events.*[].eventHorizon must be one of PAST, ONGOING, FUTURE.',
    '',
    'Top-level schema:',
    '{',
    '  "extraction":{"worldSetting":"","timeline":[],"locations":[],"characters":[],"events":{"primary":[],"secondary":[]},"characterRelations":[]},',
    '  "draftPatch":{"world":{},"worldview":{},"worldLorebooks":[],"futureHistoricalEvents":[],"agentDrafts":[],"worldProse":{},"agentProse":{},"evidenceRefs":[],"notes":[]}',
    '}',
    '',
    'Allowed world prose fields: description, tagline, motto, overview.',
    'Allowed agent prose fields: scenario, greeting, exampleDialogue, systemPromptBase.',
    'Each prose field must use {"content":"...","confidence":0.0,"evidenceRefs":[]}.',
    'Agent draft structural patch fields must NOT include scenario/greeting/exampleDialogue/systemPromptBase.',
    '',
    'Agent draft patch schema (partial allowed):',
    '{"characterName":"...","handle":"","concept":"","backstory":"","coreValues":"","relationshipStyle":"","description":"","rules":{"format":"rule-lines-v1","lines":[],"text":""},"postHistoryInstructions":"","alternateGreetings":[],"agentLorebooks":[],"referenceImageUrl":"","wakeStrategy":"PASSIVE","dnaPrimary":"","dnaSecondary":[],"dna":{}}',
    '',
    focusLine,
    missingFieldLine,
    `CHUNK_INDEX: ${input.index + 1}/${input.total}`,
    'CURRENT_COARSE_RESULT:',
    JSON.stringify(input.seed || {}),
    ...(input.accumulatedContext ? ['ACCUMULATED_FACT_CONTEXT:', input.accumulatedContext] : []),
    ...(input.accumulatorSlice ? ['CURRENT_ACCUMULATOR_SLICE:', JSON.stringify(input.accumulatorSlice)] : []),
    '<document_content>',
    input.chunk,
    '</document_content>',
  ].join('\n');
}

function buildFineSchemaLines(): string[] {
  return [
    '{',
    '  "extraction":{"worldSetting":"string summary","timeline":[],"locations":[],"characters":[],"events":{"primary":[],"secondary":[]},"characterRelations":[]},',
    '  "draftPatch":{"world":{},"worldview":{},"worldLorebooks":[],"futureHistoricalEvents":[],"agentDrafts":[],"worldProse":{},"agentProse":{},"evidenceRefs":[],"notes":[]}',
    '}',
  ];
}

function parseFineOutput(raw: Record<string, unknown>, chunkIndex: number): {
  extraction: ChunkExtraction;
  draftPatch: DraftPatch;
} {
  return {
    extraction: normalizeFineExtraction(raw),
    draftPatch: normalizeDraftPatch(raw, chunkIndex),
  };
}

async function generateWithTransientRetry(
  llm: RouteCapabilityLlmInvoker,
  input: {
    prompt: string;
    attempt: number;
    chunkIndex: number;
    chunkTotal: number;
    abortSignal?: AbortSignal;
  },
): Promise<{
  response: {
    text: string;
    promptTraceId: string;
  };
  transientRetries: number;
}> {
  let transientRetries = 0;
  while (true) {
    try {
      const response = await llm.generateText({
        capability: 'text.generate',
        prompt: input.prompt,
        mode: 'STORY',
        abortSignal: input.abortSignal,
      });
      diagLog('llm-response', {
        chunkIndex: input.chunkIndex,
        chunkTotal: input.chunkTotal,
        attempt: input.attempt,
        transientRetries,
        promptTraceId: response.promptTraceId,
        textLength: String(response.text || '').length,
      });
      return { response, transientRetries };
    } catch (error) {
      if (!isRetryableChunkError(error) || transientRetries >= 1 || input.abortSignal?.aborted) {
        throw error;
      }
      transientRetries += 1;
      diagLog('transient-retry', {
        chunkIndex: input.chunkIndex,
        chunkTotal: input.chunkTotal,
        attempt: input.attempt,
        transientRetries,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
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
): Promise<{
  extraction: ChunkExtraction;
  draftPatch: DraftPatch;
  retryCount: number;
}> {
  const prompt = buildFinePrompt(input);
  const first = await generateWithTransientRetry(llm, {
    prompt,
    attempt: 1,
    chunkIndex: input.index,
    chunkTotal: input.total,
    abortSignal: input.abortSignal,
  });
  try {
    const parsed = parseFineOutput(parseJsonRecord(first.response.text), input.index);
    diagLog('parse-success', {
      chunkIndex: input.index,
      chunkTotal: input.total,
      attempt: 1,
      promptTraceId: first.response.promptTraceId,
      extraction: summarizeExtractionCounts(parsed.extraction),
      draftPatch: summarizeDraftPatchCounts(parsed.draftPatch),
    });
    return {
      ...parsed,
      retryCount: first.transientRetries,
    };
  } catch (firstError) {
    diagLog('parse-failed', {
      chunkIndex: input.index,
      chunkTotal: input.total,
      attempt: 1,
      promptTraceId: first.response.promptTraceId,
      error: summarizeModelError(firstError),
    });
    const repairPrompt = buildRepairPrompt({
      schemaLines: buildFineSchemaLines(),
      chunk: input.chunk,
      chunkIndex: input.index,
      chunkTotal: input.total,
      invalidOutput: String(first.response.text || ''),
      parseError: summarizeModelError(firstError),
    });
    const second = await generateWithTransientRetry(llm, {
      prompt: repairPrompt,
      attempt: 2,
      chunkIndex: input.index,
      chunkTotal: input.total,
      abortSignal: input.abortSignal,
    });
    try {
      const parsed = parseFineOutput(parseJsonRecord(second.response.text), input.index);
      diagLog('parse-success', {
        chunkIndex: input.index,
        chunkTotal: input.total,
        attempt: 2,
        promptTraceId: second.response.promptTraceId,
        extraction: summarizeExtractionCounts(parsed.extraction),
        draftPatch: summarizeDraftPatchCounts(parsed.draftPatch),
      });
      return {
        ...parsed,
        retryCount: 1 + first.transientRetries + second.transientRetries,
      };
    } catch (secondError) {
      diagLog('parse-failed', {
        chunkIndex: input.index,
        chunkTotal: input.total,
        attempt: 2,
        promptTraceId: second.response.promptTraceId,
        error: summarizeModelError(secondError),
      });
      throw new Error(`WORLD_STUDIO_FINE_JSON_PARSE_FAILED: ${summarizeModelError(firstError)} -> ${summarizeModelError(secondError)}`);
    }
  }
}
