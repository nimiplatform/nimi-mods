import type {
  AgentProseCandidateField,
  DraftPatch,
  DraftPatchEvidenceRef,
  EventNodeDraft,
  FinalDraftAccumulator,
  Phase2EnrichmentPatch,
  Phase2Result,
  Phase2WeakFieldIssue,
  Phase2WeakFieldReason,
  ProseCandidateRecord,
  RouteCapabilityLlmInvoker,
  WorldProseCandidateField,
  WorldStudioAgentDraft,
  WorldStudioKnowledgeGraphDraft,
} from './types.js';
import { parseJsonRecord } from './json-repair.js';
import { emitWorldStudioDiag } from '../logging.js';
import { isRetryableChunkError } from './errors.js';
import { applyDraftPatch, buildFinalDraftAccumulatorSlice, createEmptyFinalDraftAccumulator } from './final-draft-accumulator.js';
import { deriveNeedsEvidence, normalizeEventHorizon } from '../services/event-horizon.js';
import { asRecord } from "@nimiplatform/sdk/mod";
import {
  alignAgentStructuralDraft,
  alignWorldPatch,
  alignWorldviewPatch,
  AGENT_PROSE_FIELDS,
  WORLD_PROSE_FIELDS,
} from './realm-alignment.js';
import {
  buildEventLorebooks,
  normalizeAgentDraft,
  normalizeNullableString,
  truncate,
  validateEventGraph,
} from './synthesize-normalize.js';

type Phase2RoundName = 'round1-produce' | 'round2-enrich' | 'round3-audit';

type Phase2PromptBudget = {
  timeline: number;
  locations: number;
  primaryEvents: number;
  secondaryEvents: number;
  characterProfiles: number;
  characterRelations: number;
  evidenceSnippets: number;
  worldSettingMaxChars: number;
  maxTokens: number;
  accumulatorSlice: {
    maxLorebooks: number;
    maxFutureEvents: number;
    maxAgentDrafts: number;
    maxRevisions: number;
  };
};

type Phase2DraftState = {
  world: Record<string, unknown>;
  worldview: Record<string, unknown>;
  worldEvents: EventNodeDraft[];
  worldLorebooks: Array<Record<string, unknown>>;
  futureHistoricalEvents: Array<Record<string, unknown>>;
  agentDrafts: WorldStudioAgentDraft[];
};

const DEFAULT_PROMPT_BUDGET: Phase2PromptBudget = {
  timeline: 18,
  locations: 16,
  primaryEvents: 24,
  secondaryEvents: 32,
  characterProfiles: 16,
  characterRelations: 24,
  evidenceSnippets: 20,
  worldSettingMaxChars: 800,
  maxTokens: 2200,
  accumulatorSlice: {
    maxLorebooks: 12,
    maxFutureEvents: 12,
    maxAgentDrafts: 16,
    maxRevisions: 12,
  },
};

const COMPACT_PROMPT_BUDGET: Phase2PromptBudget = {
  timeline: 12,
  locations: 12,
  primaryEvents: 14,
  secondaryEvents: 20,
  characterProfiles: 10,
  characterRelations: 16,
  evidenceSnippets: 12,
  worldSettingMaxChars: 500,
  maxTokens: 1400,
  accumulatorSlice: {
    maxLorebooks: 8,
    maxFutureEvents: 8,
    maxAgentDrafts: 10,
    maxRevisions: 8,
  },
};

const PROSE_MIN_CHARS = 50;
const SUMMARY_MIN_CHARS = 30;
const LIST_MIN_ITEMS = 2;

function diag(event: string, details?: Record<string, unknown>) {
  try {
    emitWorldStudioDiag({
      stage: 'phase2',
      event,
      level: 'debug',
      source: 'world-studio.engine.synthesize',
      details,
    });
  } catch {
    // ignore diagnostics sink failures
  }
}

function isTimeoutLikeError(error: unknown): boolean {
  const message = String(error instanceof Error ? error.message : error || '').toLowerCase();
  return message.includes('timeout') || message.includes('deadline');
}

function isJsonParseRetryableError(error: unknown): boolean {
  const message = String(error instanceof Error ? error.message : error || '').toLowerCase();
  return message.includes('json')
    || message.includes('object_required')
    || message.includes('empty_model_output');
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(asRecord(value)).length > 0;
  return false;
}

function hasPresentObjectField(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key) && record[key] != null;
}

function summarizeText(value: unknown): string {
  return String(value || '').trim();
}

function asObjectArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item === 'object').map((item) => asRecord(item));
}

function cloneRecord<T extends Record<string, unknown>>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeEventArray(value: unknown): EventNodeDraft[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => {
      const record = asRecord(item);
      const level = String(record.level || '').trim().toUpperCase() === 'SECONDARY'
        ? 'SECONDARY'
        : 'PRIMARY';
      const eventHorizon = normalizeEventHorizon(record.eventHorizon, 'PAST');
      const evidenceRefs = Array.isArray(record.evidenceRefs)
        ? record.evidenceRefs
          .filter((entry) => entry && typeof entry === 'object')
          .map((entry) => ({
            segmentId: String(asRecord(entry).segmentId || ''),
            offsetStart: Number(asRecord(entry).offsetStart || 0),
            offsetEnd: Number(asRecord(entry).offsetEnd || 0),
            excerpt: String(asRecord(entry).excerpt || ''),
            confidence: Number(asRecord(entry).confidence || 0.5),
            sourceType: 'text' as const,
          }))
        : [];
      const temporalBeforeEventIds = Array.isArray(record.temporalBeforeEventIds || record.beforeEventIds)
        ? (record.temporalBeforeEventIds || record.beforeEventIds) as unknown[]
        : [];
      const temporalAfterEventIds = Array.isArray(record.temporalAfterEventIds || record.afterEventIds)
        ? (record.temporalAfterEventIds || record.afterEventIds) as unknown[]
        : [];
      const temporalConfidence = Number(record.temporalConfidence);
      return {
        id: String(record.id || `${level.toLowerCase()}-${index + 1}`),
        ...(Number.isFinite(Number(record.timelineSeq))
          ? { timelineSeq: Math.max(1, Math.trunc(Number(record.timelineSeq))) }
          : {}),
        level,
        eventHorizon,
        parentEventId: String(record.parentEventId || '').trim() || null,
        title: String(record.title || `Event ${index + 1}`),
        summary: String(record.summary || ''),
        cause: String(record.cause || ''),
        process: String(record.process || ''),
        result: String(record.result || ''),
        timeRef: String(record.timeRef || record.timelineAnchorLabel || ''),
        locationRefs: Array.isArray(record.locationRefs)
          ? record.locationRefs.map((entry) => String(entry || '')).filter(Boolean)
          : [],
        characterRefs: Array.isArray(record.characterRefs)
          ? record.characterRefs.map((entry) => String(entry || '')).filter(Boolean)
          : [],
        dependsOnEventIds: Array.isArray(record.dependsOnEventIds)
          ? record.dependsOnEventIds.map((entry) => String(entry || '')).filter(Boolean)
          : [],
        ...(temporalBeforeEventIds.length > 0
          ? { temporalBeforeEventIds: temporalBeforeEventIds.map((entry) => String(entry || '')).filter(Boolean) }
          : {}),
        ...(temporalAfterEventIds.length > 0
          ? { temporalAfterEventIds: temporalAfterEventIds.map((entry) => String(entry || '')).filter(Boolean) }
          : {}),
        ...(Number.isFinite(temporalConfidence)
          ? { temporalConfidence: Math.max(0, Math.min(1, temporalConfidence)) }
          : {}),
        evidenceRefs,
        confidence: Number(record.confidence || 0.5),
        needsEvidence: deriveNeedsEvidence({
          level,
          eventHorizon,
          evidenceRefs,
          needsEvidence: record.needsEvidence,
        }),
      };
    });
}

function candidateScore(candidate: ProseCandidateRecord): number {
  const evidenceCount = Array.isArray(candidate.evidenceRefs) ? candidate.evidenceRefs.length : 0;
  const lengthBonus = Math.min(String(candidate.content || '').trim().length, 240) / 24;
  return (Number(candidate.confidence || 0) * 100) + (evidenceCount * 12) + lengthBonus;
}

function topCandidate(bucket?: ProseCandidateRecord[]): ProseCandidateRecord | null {
  if (!Array.isArray(bucket) || bucket.length === 0) return null;
  return [...bucket].sort((left, right) => candidateScore(right) - candidateScore(left))[0] || null;
}

function resolveWorldWorkingValues(accumulator: FinalDraftAccumulator): Record<string, unknown> {
  return WORLD_PROSE_FIELDS.reduce<Record<string, unknown>>((acc, field) => {
    const record = accumulator.worldWorkingProseByField[field];
    if (record?.content?.trim()) {
      acc[field] = record.content.trim();
    }
    return acc;
  }, {});
}

function resolveWorldCandidateValues(accumulator: FinalDraftAccumulator): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const field of WORLD_PROSE_FIELDS) {
    if (accumulator.worldWorkingProseByField[field]?.content?.trim()) {
      continue;
    }
    const candidate = topCandidate(accumulator.worldProseCandidatesByField[field]);
    if (candidate?.content?.trim()) {
      patch[field] = candidate.content.trim();
    }
  }
  return patch;
}

function resolveAgentCandidateValues(
  accumulator: FinalDraftAccumulator,
  characterName: string,
): Partial<Record<AgentProseCandidateField, string>> {
  const fields = accumulator.agentProseCandidatesByCharacterAndField[characterName] || {};
  return AGENT_PROSE_FIELDS.reduce<Partial<Record<AgentProseCandidateField, string>>>((acc, field) => {
    if (accumulator.agentWorkingProseByCharacterAndField[characterName]?.[field]?.content?.trim()) {
      return acc;
    }
    const candidate = topCandidate(fields[field]);
    if (candidate?.content?.trim()) {
      acc[field] = candidate.content.trim();
    }
    return acc;
  }, {});
}

function resolveAgentWorkingValues(
  accumulator: FinalDraftAccumulator,
  characterName: string,
): Partial<Record<AgentProseCandidateField, string>> {
  const fields = accumulator.agentWorkingProseByCharacterAndField[characterName] || {};
  return AGENT_PROSE_FIELDS.reduce<Partial<Record<AgentProseCandidateField, string>>>((acc, field) => {
    const record = fields[field];
    if (record?.content?.trim()) {
      acc[field] = record.content.trim();
    }
    return acc;
  }, {});
}

function buildFallbackAgentDrafts(input: {
  selectedCharacters: string[];
  knowledgeGraph: WorldStudioKnowledgeGraphDraft;
}): WorldStudioAgentDraft[] {
  const profileByName = new Map(
    (input.knowledgeGraph.characterProfiles || []).map((profile) => [profile.name, profile] as const),
  );
  return input.selectedCharacters.map((characterName, index) => {
    const profile = profileByName.get(characterName);
    return {
      characterName,
      handle: `~agent_${index + 1}`,
      concept: String(profile?.summary || '').trim(),
      backstory: String(profile?.background || '').trim(),
      coreValues: String(profile?.motivation || '').trim(),
      relationshipStyle: Array.isArray(profile?.relationships) ? profile.relationships.join('；') : '',
      description: normalizeNullableString(profile?.summary || ''),
      scenario: null,
      greeting: null,
      exampleDialogue: null,
      systemPromptBase: null,
      rules: {
        format: 'rule-lines-v1',
        lines: [],
        text: '',
      },
      alternateGreetings: [],
      agentLorebooks: [],
    };
  });
}

function buildEvidenceSnippets(graph: WorldStudioKnowledgeGraphDraft, maxSnippets: number): Array<Record<string, unknown>> {
  const snippets: Array<Record<string, unknown>> = [];
  graph.events.primary.forEach((event) => {
    (event.evidenceRefs || []).slice(0, 2).forEach((evidence, evidenceIndex) => {
      snippets.push({
        eventId: event.id,
        eventTitle: event.title,
        index: evidenceIndex,
        segmentId: evidence.segmentId,
        excerpt: truncate(String(evidence.excerpt || ''), 220),
        confidence: Number(evidence.confidence || 0),
      });
    });
  });
  return snippets.slice(0, maxSnippets);
}

function buildStructuredGraphForPrompt(input: {
  selectedStartTimeId: string;
  selectedCharacters: string[];
  knowledgeGraph: WorldStudioKnowledgeGraphDraft;
}, budget: Phase2PromptBudget): Record<string, unknown> {
  const profileMap = new Map((input.knowledgeGraph.characterProfiles || []).map((profile) => [profile.name, profile] as const));
  const selectedCharacterProfiles = input.selectedCharacters
    .map((name) => profileMap.get(name))
    .filter((item) => Boolean(item));
  return {
    selectedStartTimeId: input.selectedStartTimeId,
    selectedCharacters: input.selectedCharacters,
    worldSetting: truncate(input.knowledgeGraph.worldSetting, budget.worldSettingMaxChars),
    narrativeArc: input.knowledgeGraph.narrativeArc || null,
    timeline: input.knowledgeGraph.timeline.slice(0, budget.timeline),
    locations: input.knowledgeGraph.locations.slice(0, budget.locations),
    characterProfiles: selectedCharacterProfiles.length > 0
      ? selectedCharacterProfiles
      : (input.knowledgeGraph.characterProfiles || []).slice(0, budget.characterProfiles),
    characterAliasMap: input.knowledgeGraph.characterAliasMap || {},
    characterRelations: input.knowledgeGraph.characterRelations.slice(0, budget.characterRelations),
    primaryEvents: input.knowledgeGraph.events.primary.slice(0, budget.primaryEvents),
    secondaryEvents: input.knowledgeGraph.events.secondary.slice(0, budget.secondaryEvents),
    futureHistoricalEvents: input.knowledgeGraph.futureHistoricalEvents || [],
    evidenceSnippets: buildEvidenceSnippets(input.knowledgeGraph, budget.evidenceSnippets),
  };
}

function buildPhase2SeedState(input: {
  selectedCharacters: string[];
  knowledgeGraph: WorldStudioKnowledgeGraphDraft;
  finalDraftAccumulator: FinalDraftAccumulator;
}): Phase2DraftState {
  const accumulator = input.finalDraftAccumulator;
  const fallbackDrafts = buildFallbackAgentDrafts(input);
  const seedByCharacter = new Map<string, WorldStudioAgentDraft>();
  fallbackDrafts.forEach((draft) => {
    seedByCharacter.set(draft.characterName, draft);
  });
  Object.values(accumulator.agentDraftsByCharacter || {}).forEach((draft, index) => {
    const characterName = String(draft.characterName || input.selectedCharacters[index] || '').trim();
    if (!characterName) return;
    seedByCharacter.set(characterName, {
      ...(seedByCharacter.get(characterName) || normalizeAgentDraft({}, characterName, index)),
      ...alignAgentStructuralDraft({
        ...draft,
        characterName,
      }),
      characterName,
    });
  });
  input.selectedCharacters.forEach((characterName, index) => {
    const base = seedByCharacter.get(characterName) || normalizeAgentDraft({}, characterName, index);
    const workingValues = resolveAgentWorkingValues(accumulator, characterName);
    const candidateValues = resolveAgentCandidateValues(accumulator, characterName);
    seedByCharacter.set(characterName, {
      ...base,
      ...(workingValues.scenario ? { scenario: workingValues.scenario } : {}),
      ...(workingValues.greeting ? { greeting: workingValues.greeting } : {}),
      ...(workingValues.exampleDialogue ? { exampleDialogue: workingValues.exampleDialogue } : {}),
      ...(workingValues.systemPromptBase ? { systemPromptBase: workingValues.systemPromptBase } : {}),
      ...(candidateValues.scenario ? { scenario: candidateValues.scenario } : {}),
      ...(candidateValues.greeting ? { greeting: candidateValues.greeting } : {}),
      ...(candidateValues.exampleDialogue ? { exampleDialogue: candidateValues.exampleDialogue } : {}),
      ...(candidateValues.systemPromptBase ? { systemPromptBase: candidateValues.systemPromptBase } : {}),
    });
  });
  return {
    world: {
      ...alignWorldPatch(accumulator.world || {}),
      ...resolveWorldCandidateValues(accumulator),
      ...resolveWorldWorkingValues(accumulator),
    },
    worldview: alignWorldviewPatch(accumulator.worldview || {}),
    worldEvents: [...input.knowledgeGraph.events.primary, ...input.knowledgeGraph.events.secondary],
    worldLorebooks: Array.isArray(accumulator.worldLorebooks) ? accumulator.worldLorebooks : [],
    futureHistoricalEvents: Array.isArray(accumulator.futureHistoricalEvents) ? accumulator.futureHistoricalEvents : [],
    agentDrafts: input.selectedCharacters
      .map((characterName, index) => seedByCharacter.get(characterName) || normalizeAgentDraft({}, characterName, index))
      .filter((draft) => Boolean(String(draft.characterName || '').trim())),
  };
}

function mergeMeaningful(base: unknown, incoming: unknown): unknown {
  if (typeof incoming === 'object' && incoming && !Array.isArray(incoming)) {
    const baseRecord = (typeof base === 'object' && base && !Array.isArray(base)) ? asRecord(base) : {};
    const next: Record<string, unknown> = { ...baseRecord };
    Object.entries(asRecord(incoming)).forEach(([key, value]) => {
      next[key] = mergeMeaningful(baseRecord[key], value);
    });
    return next;
  }
  if (!hasMeaningfulValue(incoming)) return base;
  if (Array.isArray(incoming)) {
    return incoming.length > 0 ? incoming : base;
  }
  if (typeof incoming === 'string') {
    return incoming.trim().length > 0 ? incoming.trim() : base;
  }
  return incoming;
}

function stablePatchArrayIdentity(value: unknown): string {
  if (value == null) return '';
  if (typeof value !== 'object' || Array.isArray(value)) {
    return `${typeof value}:${String(value)}`;
  }
  const record = asRecord(value);
  for (const key of ['id', 'key', 'name', 'characterName', 'title']) {
    const normalized = String(record[key] || '').trim();
    if (normalized) {
      return `${key}:${normalized}`;
    }
  }
  const ordered = Object.keys(record)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = record[key];
      return acc;
    }, {});
  return JSON.stringify(ordered);
}

function mergePatchArray(base: unknown, incoming: unknown): unknown {
  if (!Array.isArray(incoming) || incoming.length === 0) return base;
  if (!Array.isArray(base) || base.length === 0) {
    return incoming;
  }
  const next = [...base];
  const indexByIdentity = new Map<string, number>();
  next.forEach((item, index) => {
    const identity = stablePatchArrayIdentity(item);
    if (identity) {
      indexByIdentity.set(identity, index);
    }
  });
  incoming.forEach((item) => {
    const identity = stablePatchArrayIdentity(item);
    const existingIndex = identity ? indexByIdentity.get(identity) : undefined;
    if (existingIndex != null) {
      next[existingIndex] = mergePatchMeaningful(next[existingIndex], item);
      return;
    }
    next.push(item);
    if (identity) {
      indexByIdentity.set(identity, next.length - 1);
    }
  });
  return next;
}

function mergePatchMeaningful(base: unknown, incoming: unknown): unknown {
  if (typeof incoming === 'object' && incoming && !Array.isArray(incoming)) {
    const baseRecord = (typeof base === 'object' && base && !Array.isArray(base)) ? asRecord(base) : {};
    const next: Record<string, unknown> = { ...baseRecord };
    Object.entries(asRecord(incoming)).forEach(([key, value]) => {
      next[key] = mergePatchMeaningful(baseRecord[key], value);
    });
    return next;
  }
  if (!hasMeaningfulValue(incoming)) return base;
  if (Array.isArray(incoming)) {
    return mergePatchArray(base, incoming);
  }
  if (typeof incoming === 'string') {
    return incoming.trim().length > 0 ? incoming.trim() : base;
  }
  return incoming;
}

function mergeAgentDrafts(
  selectedCharacters: string[],
  base: WorldStudioAgentDraft[],
  incoming: WorldStudioAgentDraft[],
  mergeFn: (baseValue: unknown, incomingValue: unknown) => unknown = mergeMeaningful,
): WorldStudioAgentDraft[] {
  const baseByCharacter = new Map(base.map((draft) => [draft.characterName, draft] as const));
  incoming.forEach((draft, index) => {
    const characterName = String(draft.characterName || selectedCharacters[index] || '').trim();
    if (!characterName) return;
    const mergedSource = mergeFn(baseByCharacter.get(characterName) || {}, draft);
    const normalized = normalizeAgentDraft({
      ...(baseByCharacter.get(characterName) || {}),
      ...(typeof mergedSource === 'object' && mergedSource && !Array.isArray(mergedSource)
        ? asRecord(mergedSource)
        : {}),
      characterName,
    }, characterName, index);
    baseByCharacter.set(characterName, normalized);
  });
  return selectedCharacters
    .map((characterName, index) => baseByCharacter.get(characterName) || normalizeAgentDraft({}, characterName, index))
    .filter((draft) => Boolean(String(draft.characterName || '').trim()));
}

function materializeFullDraftState(input: {
  base: Phase2DraftState;
  selectedCharacters: string[];
  knowledgeGraph: WorldStudioKnowledgeGraphDraft;
  payload: Record<string, unknown>;
}): Phase2DraftState {
  const incomingWorld = alignWorldPatch(input.payload.world || {});
  const incomingWorldview = alignWorldviewPatch(input.payload.worldview || {});
  const incomingEvents = normalizeEventArray(input.payload.worldEvents);
  const incomingLorebooks = asObjectArray(input.payload.worldLorebooks);
  const incomingFutureEvents = asObjectArray(input.payload.futureHistoricalEvents);
  const incomingAgentDrafts = Array.isArray(input.payload.agentDrafts)
    ? input.payload.agentDrafts
      .filter((item) => item && typeof item === 'object')
      .map((item, index) => {
        const normalized = normalizeAgentDraft(item, input.selectedCharacters[index] || '', index);
        return {
          ...normalized,
          ...alignAgentStructuralDraft(normalized),
          ...(Object.prototype.hasOwnProperty.call(asRecord(item), 'scenario')
            ? { scenario: normalizeNullableString(asRecord(item).scenario) }
            : {}),
          ...(Object.prototype.hasOwnProperty.call(asRecord(item), 'greeting')
            ? { greeting: normalizeNullableString(asRecord(item).greeting) }
            : {}),
          ...(Object.prototype.hasOwnProperty.call(asRecord(item), 'exampleDialogue')
            ? { exampleDialogue: normalizeNullableString(asRecord(item).exampleDialogue) }
            : {}),
          ...(Object.prototype.hasOwnProperty.call(asRecord(item), 'systemPromptBase')
            ? { systemPromptBase: normalizeNullableString(asRecord(item).systemPromptBase) }
            : {}),
        };
      })
    : [];
  return {
    world: mergeMeaningful(input.base.world, incomingWorld) as Record<string, unknown>,
    worldview: mergeMeaningful(input.base.worldview, incomingWorldview) as Record<string, unknown>,
    worldEvents: incomingEvents.length > 0 ? incomingEvents : input.base.worldEvents,
    worldLorebooks: incomingLorebooks.length > 0 ? incomingLorebooks : input.base.worldLorebooks,
    futureHistoricalEvents: incomingFutureEvents.length > 0 ? incomingFutureEvents : input.base.futureHistoricalEvents,
    agentDrafts: mergeAgentDrafts(input.selectedCharacters, input.base.agentDrafts, incomingAgentDrafts, mergeMeaningful),
  };
}

function applyEnrichmentPatch(input: {
  base: Phase2DraftState;
  selectedCharacters: string[];
  patch: Phase2EnrichmentPatch;
}): Phase2DraftState {
  const patch = asRecord(input.patch);
  const incomingWorld = alignWorldPatch(patch.world || {});
  const incomingWorldview = alignWorldviewPatch(patch.worldview || {});
  const incomingLorebooks = asObjectArray(patch.worldLorebooks);
  const incomingFutureEvents = asObjectArray(patch.futureHistoricalEvents);
  const incomingAgentDrafts = Array.isArray(patch.agentDrafts)
    ? patch.agentDrafts
      .filter((item) => item && typeof item === 'object')
      .map((item, index) => {
        const record = asRecord(item);
        const characterName = String(record.characterName || input.selectedCharacters[index] || '').trim();
        return {
          ...normalizeAgentDraft(record, characterName, index),
          ...alignAgentStructuralDraft(normalizeAgentDraft(record, characterName, index)),
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
        };
      })
    : [];
  return {
    world: mergePatchMeaningful(input.base.world, incomingWorld) as Record<string, unknown>,
    worldview: mergePatchMeaningful(input.base.worldview, incomingWorldview) as Record<string, unknown>,
    worldEvents: input.base.worldEvents,
    worldLorebooks: mergePatchArray(input.base.worldLorebooks, incomingLorebooks) as Array<Record<string, unknown>>,
    futureHistoricalEvents: mergePatchArray(input.base.futureHistoricalEvents, incomingFutureEvents) as Array<Record<string, unknown>>,
    agentDrafts: mergeAgentDrafts(input.selectedCharacters, input.base.agentDrafts, incomingAgentDrafts, mergePatchMeaningful),
  };
}

function countWorldFieldEvidence(accumulator: FinalDraftAccumulator, field: WorldProseCandidateField): number {
  const working = accumulator.worldWorkingProseByField[field];
  if (working?.evidenceRefs?.length) {
    return working.evidenceRefs.length;
  }
  const bucket = accumulator.worldProseCandidatesByField[field] || [];
  const bucketEvidence = bucket.reduce((count, item) => count + (Array.isArray(item.evidenceRefs) ? item.evidenceRefs.length : 0), 0);
  return bucketEvidence || accumulator.evidenceRefs.length;
}

function countAgentFieldEvidence(
  graph: WorldStudioKnowledgeGraphDraft,
  accumulator: FinalDraftAccumulator,
  characterName: string,
  field: AgentProseCandidateField | 'concept' | 'backstory' | 'coreValues' | 'relationshipStyle' | 'description',
): number {
  if (field === 'scenario' || field === 'greeting' || field === 'exampleDialogue' || field === 'systemPromptBase') {
    const working = accumulator.agentWorkingProseByCharacterAndField[characterName]?.[field];
    if (working?.evidenceRefs?.length) {
      return working.evidenceRefs.length;
    }
    const bucket = accumulator.agentProseCandidatesByCharacterAndField[characterName]?.[field] || [];
    const bucketEvidence = bucket.reduce((count, item) => count + (Array.isArray(item.evidenceRefs) ? item.evidenceRefs.length : 0), 0);
    if (bucketEvidence > 0) return bucketEvidence;
  }
  const profile = (graph.characterProfiles || []).find((item) => item.name === characterName);
  const relatedEvents = graph.events.primary.filter((event) => (event.characterRefs || []).includes(characterName));
  return (Array.isArray(profile?.keyEvents) ? profile.keyEvents.length : 0) + relatedEvents.reduce((count, event) => count + (event.evidenceRefs?.length || 0), 0);
}

function buildWeakFieldReport(input: {
  draft: Phase2DraftState;
  selectedCharacters: string[];
  knowledgeGraph: WorldStudioKnowledgeGraphDraft;
  finalDraftAccumulator: FinalDraftAccumulator;
}): { issues: Phase2WeakFieldIssue[] } {
  const issues: Phase2WeakFieldIssue[] = [];
  const pushIssue = (path: string, reason: Phase2WeakFieldReason, detail: string) => {
    issues.push({ path, reason, detail });
  };
  const world = asRecord(input.draft.world);
  const proseWorldFields: WorldProseCandidateField[] = ['description', 'tagline', 'motto', 'overview'];
  proseWorldFields.forEach((field) => {
    const text = summarizeText(world[field]);
    if (!text) {
      pushIssue(`world.${field}`, 'empty', 'missing value');
    } else if (text.length < PROSE_MIN_CHARS) {
      pushIssue(`world.${field}`, 'low_information', `chars=${text.length} threshold=${PROSE_MIN_CHARS}`);
    }
    if (text && countWorldFieldEvidence(input.finalDraftAccumulator, field) <= 0) {
      pushIssue(`world.${field}`, 'low_evidence', 'candidate/evidence coverage missing');
    }
  });
  ['name', 'genre', 'era'].forEach((field) => {
    const text = summarizeText(world[field]);
    if (!text) {
      pushIssue(`world.${field}`, 'empty', 'missing value');
    } else if (text.length < SUMMARY_MIN_CHARS && field !== 'name') {
      pushIssue(`world.${field}`, 'low_information', `chars=${text.length} threshold=${SUMMARY_MIN_CHARS}`);
    }
  });
  const worldview = asRecord(input.draft.worldview);
  ['timeModel', 'spaceTopology', 'causality', 'coreSystem'].forEach((field) => {
    const record = asRecord(worldview[field]);
    if (Object.keys(record).length === 0) {
      pushIssue(`worldview.${field}`, 'empty', 'required module missing');
    }
  });
  if (input.draft.worldLorebooks.length < LIST_MIN_ITEMS) {
    pushIssue('worldLorebooks', 'low_information', `count=${input.draft.worldLorebooks.length} threshold=${LIST_MIN_ITEMS}`);
  }
  const agentByCharacter = new Map(input.draft.agentDrafts.map((draft) => [draft.characterName, draft] as const));
  input.selectedCharacters.forEach((characterName) => {
    const draft = agentByCharacter.get(characterName);
    if (!draft) {
      pushIssue(`agent:${characterName}`, 'incomplete_reference', 'selected character missing from agentDrafts');
      return;
    }
    const summaryFields = ['concept', 'backstory', 'coreValues', 'relationshipStyle', 'description'] as const;
    summaryFields.forEach((field) => {
      const text = summarizeText(draft[field] || '');
      if (!text) {
        pushIssue(`agent:${characterName}.${field}`, 'empty', 'missing value');
      } else if (text.length < SUMMARY_MIN_CHARS) {
        pushIssue(`agent:${characterName}.${field}`, 'low_information', `chars=${text.length} threshold=${SUMMARY_MIN_CHARS}`);
      }
      if (text && countAgentFieldEvidence(input.knowledgeGraph, input.finalDraftAccumulator, characterName, field) <= 0) {
        pushIssue(`agent:${characterName}.${field}`, 'low_evidence', 'character evidence missing');
      }
    });
    (['scenario', 'greeting', 'exampleDialogue', 'systemPromptBase'] as const).forEach((field) => {
      const text = summarizeText(draft[field] || '');
      if (!text) {
        pushIssue(`agent:${characterName}.${field}`, 'empty', 'missing value');
      } else if (text.length < PROSE_MIN_CHARS) {
        pushIssue(`agent:${characterName}.${field}`, 'low_information', `chars=${text.length} threshold=${PROSE_MIN_CHARS}`);
      }
      if (text && countAgentFieldEvidence(input.knowledgeGraph, input.finalDraftAccumulator, characterName, field) <= 0) {
        pushIssue(`agent:${characterName}.${field}`, 'low_evidence', 'candidate/evidence coverage missing');
      }
    });
    if ((draft.agentLorebooks || []).length < LIST_MIN_ITEMS) {
      pushIssue(`agent:${characterName}.agentLorebooks`, 'low_information', `count=${(draft.agentLorebooks || []).length} threshold=${LIST_MIN_ITEMS}`);
    }
  });
  return { issues };
}

function resolvePhase2EvidenceRefs(input: {
  fieldPath: string;
  seedRefs: Array<DraftPatchEvidenceRef | Record<string, unknown>>;
  accumulator: FinalDraftAccumulator;
}): DraftPatchEvidenceRef[] {
  const fromSeed = input.seedRefs
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const record = asRecord(item);
      return {
        fieldPath: input.fieldPath,
        ...(typeof record.segmentId === 'string' ? { segmentId: record.segmentId } : {}),
        ...(typeof record.eventId === 'string' ? { eventId: record.eventId } : {}),
        ...(Number.isFinite(Number(record.confidence)) ? { confidence: Number(record.confidence) } : {}),
      };
    });
  if (fromSeed.length > 0) {
    return fromSeed;
  }
  if (Array.isArray(input.accumulator.evidenceRefs) && input.accumulator.evidenceRefs.length > 0) {
    return input.accumulator.evidenceRefs.slice(0, 1).map((item) => ({
      fieldPath: input.fieldPath,
      ...(typeof item.segmentId === 'string' ? { segmentId: item.segmentId } : {}),
      ...(typeof item.eventId === 'string' ? { eventId: item.eventId } : {}),
      ...(Number.isFinite(Number(item.confidence)) ? { confidence: Number(item.confidence) } : {}),
    }));
  }
  return [{ fieldPath: input.fieldPath, confidence: 0.9 }];
}

function buildWorldProsePatchFromState(
  world: Record<string, unknown>,
  accumulator: FinalDraftAccumulator,
): DraftPatch['worldProse'] {
  const patch = WORLD_PROSE_FIELDS.reduce<NonNullable<DraftPatch['worldProse']>>((acc, field) => {
    const content = String(world[field] || '').trim();
    if (!content) return acc;
    const seedRefs = [
      ...(accumulator.worldWorkingProseByField[field]?.evidenceRefs || []),
      ...((topCandidate(accumulator.worldProseCandidatesByField[field])?.evidenceRefs) || []),
    ];
    acc[field] = {
      content,
      confidence: Math.max(
        Number(accumulator.worldWorkingProseByField[field]?.confidence || 0),
        Number(topCandidate(accumulator.worldProseCandidatesByField[field])?.confidence || 0),
        0.9,
      ),
      evidenceRefs: resolvePhase2EvidenceRefs({
        fieldPath: `world.${field}`,
        seedRefs,
        accumulator,
      }),
    };
    return acc;
  }, {});
  return Object.keys(patch).length > 0 ? patch : undefined;
}

function buildAgentProsePatchFromState(
  agentDrafts: WorldStudioAgentDraft[],
  accumulator: FinalDraftAccumulator,
): DraftPatch['agentProse'] {
  const patch = agentDrafts.reduce<NonNullable<DraftPatch['agentProse']>>((acc, draft) => {
    const characterName = String(draft.characterName || '').trim();
    if (!characterName) return acc;
    const nextFields = AGENT_PROSE_FIELDS.reduce<Partial<Record<AgentProseCandidateField, {
      content: string;
      confidence: number;
      evidenceRefs?: DraftPatchEvidenceRef[];
    }>>>((fieldAcc, field) => {
      const content = String(draft[field] || '').trim();
      if (!content) return fieldAcc;
      const working = accumulator.agentWorkingProseByCharacterAndField[characterName]?.[field];
      const candidate = topCandidate(accumulator.agentProseCandidatesByCharacterAndField[characterName]?.[field]);
      fieldAcc[field] = {
        content,
        confidence: Math.max(
          Number(working?.confidence || 0),
          Number(candidate?.confidence || 0),
          0.9,
        ),
        evidenceRefs: resolvePhase2EvidenceRefs({
          fieldPath: `agent:${characterName}.${field}`,
          seedRefs: [
            ...(working?.evidenceRefs || []),
            ...(candidate?.evidenceRefs || []),
          ],
          accumulator,
        }),
      };
      return fieldAcc;
    }, {});
    if (Object.keys(nextFields).length > 0) {
      acc[characterName] = nextFields as NonNullable<DraftPatch['agentProse']>[string];
    }
    return acc;
  }, {});
  return Object.keys(patch).length > 0 ? patch : undefined;
}

function buildPhase2FullSchemaLines(): string[] {
  return [
    '{',
    '  "world":{"name":"...","tagline":"...","motto":"...","overview":"...","description":"...","genre":"...","themes":["..."],"era":"...","status":"ACTIVE","contentRating":"TEEN"},',
    '  "worldview":{"timeModel":{},"spaceTopology":{},"causality":{},"coreSystem":{"rules":[{"key":"...","title":"...","value":"..."}]},"languages":{},"existences":{},"resources":{},"structures":{},"visualGuide":{},"narrativeHooks":{}},',
    '  "worldEvents":[{"id":"evt-p1","level":"PRIMARY","eventHorizon":"PAST","parentEventId":null,"title":"...","summary":"...","cause":"...","process":"...","result":"...","timeRef":"...","locationRefs":["..."],"characterRefs":["..."],"dependsOnEventIds":[],"evidenceRefs":[{"segmentId":"...","offsetStart":0,"offsetEnd":0,"excerpt":"...","confidence":0.0,"sourceType":"text"}],"confidence":0.0,"needsEvidence":false}],',
    '  "worldLorebooks":[{"key":"topic:subtopic:item_name","name":"...","content":"...","keywords":["..."],"value":{"details":{}},"provenance":{"source":"phase2"}}],',
    '  "futureHistoricalEvents":[{"id":"future-1","title":"...","description":"...","timeNode":"...","impact":"..."}],',
    '  "agentDrafts":[{"characterName":"...","handle":"...","concept":"...","backstory":"...","coreValues":"...","relationshipStyle":"...","description":"...","scenario":"...","greeting":"...","exampleDialogue":"...","systemPromptBase":"...","rules":{"format":"rule-lines-v1","lines":["..."],"text":"..."},"postHistoryInstructions":"...","alternateGreetings":["..."],"agentLorebooks":[{"name":"...","content":"...","keywords":["..."],"priority":10,"insertionOrder":100,"constant":false,"selective":false,"secondaryKeys":[],"enabled":true,"source":"world-studio.phase2"}],"dna":{"identity":{"name":"...","role":"...","worldview":"...","species":"..."},"biological":{"gender":"...","visualAge":"...","ethnicity":"...","heightCm":0,"weightKg":0},"appearance":{"artStyle":"...","hair":"...","eyes":"...","skin":"...","fashionStyle":"...","signatureItems":[]},"personality":{"mbti":"...","interests":[],"goals":[],"relationshipMode":"..."},"communication":{"responseLength":"medium","formality":"casual","sentiment":"neutral"},"nsfwLevel":"SAFE"}}]',
    '}',
  ];
}

function buildPhase2EnrichmentPatchSchemaLines(): string[] {
  return [
    '{',
    '  "world":{"tagline":"...","motto":"...","overview":"...","description":"...","genre":"...","themes":["..."],"era":"...","contentRating":"TEEN"},',
    '  "worldview":{"timeModel":{},"spaceTopology":{},"causality":{},"coreSystem":{"rules":[{"key":"...","title":"...","value":"..."}]},"languages":{},"existences":{},"resources":{},"structures":{},"visualGuide":{},"narrativeHooks":{}},',
    '  "worldLorebooks":[{"key":"topic:subtopic:item_name","name":"...","content":"...","keywords":["..."],"value":{"details":{}},"provenance":{"source":"phase2.enrich"}}],',
    '  "futureHistoricalEvents":[{"id":"future-1","title":"...","description":"...","timeNode":"...","impact":"..."}],',
    '  "agentDrafts":[{"characterName":"...","description":"...","scenario":"...","greeting":"...","exampleDialogue":"...","systemPromptBase":"...","agentLorebooks":[{"name":"...","content":"...","keywords":["..."],"priority":10,"insertionOrder":100,"constant":false,"selective":false,"secondaryKeys":[],"enabled":true,"source":"world-studio.phase2.enrich"}]}]',
    '}',
  ];
}

function buildRoundPrompt(input: {
  round: Phase2RoundName;
  selectedStartTimeId: string;
  selectedCharacters: string[];
  knowledgeGraph: WorldStudioKnowledgeGraphDraft;
  finalDraftAccumulator: FinalDraftAccumulator;
  currentDraft: Phase2DraftState;
  weakFieldReport?: { issues: Phase2WeakFieldIssue[] };
  compact?: boolean;
  degradedMode?: boolean;
}): string {
  const budget = input.compact ? COMPACT_PROMPT_BUDGET : DEFAULT_PROMPT_BUDGET;
  const structuredGraph = buildStructuredGraphForPrompt({
    selectedStartTimeId: input.selectedStartTimeId,
    selectedCharacters: input.selectedCharacters,
    knowledgeGraph: input.knowledgeGraph,
  }, budget);
  const accumulatorSlice = buildFinalDraftAccumulatorSlice(input.finalDraftAccumulator, budget.accumulatorSlice);
  const proseCandidates = {
    world: input.finalDraftAccumulator.worldProseCandidatesByField,
    agents: input.finalDraftAccumulator.agentProseCandidatesByCharacterAndField,
  };
  const roundInstructions = (() => {
    if (input.round === 'round1-produce') {
      return [
        '## Round Goal',
        'Produce the first complete world/worldview/agent draft from knowledge graph + accumulator + prose candidate pools.',
        'Prefer accumulated structural fields when already specific.',
        'Use working prose from accumulator_context as the primary source for natural-language fields.',
        'Use prose candidate pools only as secondary evidence for backfill/correction before inventing new wording.',
      ];
    }
    if (input.round === 'round2-enrich') {
      return [
        '## Round Goal',
        'Enrich only weak or missing fields identified in weak_field_report.',
        'Return a SPARSE PATCH: only include fields you are improving.',
        'Do not rewrite already-stable fields or strong working prose.',
      ];
    }
    return [
      '## Round Goal',
      'Audit and finalize the entire publish-ready draft.',
      'Return a FULL final draft.',
      'Unify tone/style across world and agents, enforce realm field whitelist, and remove unsupported fields.',
      'Do not replace stable working prose without a concrete consistency or realm-alignment reason.',
      ...(input.degradedMode
        ? [
          '',
          '## Degraded Audit Context',
          'round2-enrich did not complete successfully.',
          'The current draft may still contain empty or thin fields.',
          'Treat empty/thin fields as "not yet rich enough", NOT as consistency failures.',
          'Only audit consistency, realm whitelist, and basic tone/style unification.',
          'Do not fail or over-rewrite solely because fields remain empty after the degraded enrich path.',
        ]
        : []),
    ];
  })();
  return [
    'You are the phase2 world-studio closure engine.',
    'Return STRICT JSON only.',
    '',
    '## Language Rule',
    'Output all player-facing/world-facing field values in the same language as the structured source context.',
    'Preserve original names and lore language. Never translate canonical names.',
    '',
    ...roundInstructions,
    '',
    '## Realm Alignment Rules',
    '- world must stay within canonical world patch fields.',
    '- worldview must stay within canonical worldview modules.',
    '- agentDrafts must stay within creator-agent canonical payload fields.',
    '- Do not output deprecated world.rules or non-canonical worldview knowledge modules.',
    '',
    '## Narrative Consistency Rules',
    '- worldEvents must align with the event graph and preserve explicit eventHorizon.',
    '- Agent prose must stay consistent with world setting, event graph, and character profiles.',
    '- Keep handle ASCII-safe and concise when present.',
    '',
    'Schema:',
    ...(input.round === 'round2-enrich'
      ? buildPhase2EnrichmentPatchSchemaLines()
      : buildPhase2FullSchemaLines()),
    '',
    `CHECKPOINT_START_TIME_ID: ${input.selectedStartTimeId}`,
    `CHECKPOINT_CHARACTERS: ${input.selectedCharacters.join(', ')}`,
    '<current_draft>',
    JSON.stringify(input.currentDraft),
    '</current_draft>',
    '<accumulator_context>',
    JSON.stringify(accumulatorSlice),
    '</accumulator_context>',
    '<prose_candidate_pools>',
    JSON.stringify(proseCandidates),
    '</prose_candidate_pools>',
    '<structured_context>',
    JSON.stringify(structuredGraph),
    '</structured_context>',
    ...(input.weakFieldReport ? [
      '<weak_field_report>',
      JSON.stringify(input.weakFieldReport),
      '</weak_field_report>',
    ] : []),
  ].join('\n');
}

async function generateWithTransientRetry(
  llm: RouteCapabilityLlmInvoker,
  input: {
    round: Phase2RoundName;
    attempt: number;
    prompt: string;
    maxTokens: number;
    abortSignal?: AbortSignal;
  },
): Promise<{ text: string; promptTraceId: string; transientRetries: number }> {
  let transientRetries = 0;
  while (true) {
    try {
      const response = await llm.generateText({
        capability: 'text.generate',
        prompt: input.prompt,
        maxTokens: input.maxTokens,
        mode: 'STORY',
        abortSignal: input.abortSignal,
      });
      diag('llm-response', {
        round: input.round,
        attempt: input.attempt,
        transientRetries,
        promptTraceId: response.promptTraceId,
        textLength: String(response.text || '').length,
        maxTokens: input.maxTokens,
      });
      return {
        text: response.text,
        promptTraceId: response.promptTraceId,
        transientRetries,
      };
    } catch (error) {
      if (!isRetryableChunkError(error) || transientRetries >= 1 || input.abortSignal?.aborted) {
        throw error;
      }
      transientRetries += 1;
      diag('transient-retry', {
        round: input.round,
        attempt: input.attempt,
        transientRetries,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

async function runRound(
  llm: RouteCapabilityLlmInvoker,
  input: {
    round: Phase2RoundName;
    promptFactory: (compact: boolean) => string;
    abortSignal?: AbortSignal;
  },
): Promise<{
  payload: Record<string, unknown>;
  rawText: string;
  promptTraceId: string;
}> {
  const attempts = [
    { attempt: 1, compact: false, maxTokens: DEFAULT_PROMPT_BUDGET.maxTokens },
    { attempt: 2, compact: true, maxTokens: COMPACT_PROMPT_BUDGET.maxTokens },
  ] as const;
  let lastError: unknown = null;
  for (const attempt of attempts) {
    const prompt = input.promptFactory(attempt.compact);
    try {
      const response = await generateWithTransientRetry(llm, {
        round: input.round,
        attempt: attempt.attempt,
        prompt,
        maxTokens: attempt.maxTokens,
        abortSignal: input.abortSignal,
      });
      try {
        const payload = parseJsonRecord(response.text);
        diag('round-parse-success', {
          round: input.round,
          attempt: attempt.attempt,
          compact: attempt.compact,
          promptTraceId: response.promptTraceId,
          topLevelKeys: Object.keys(payload),
        });
        return {
          payload,
          rawText: response.text,
          promptTraceId: response.promptTraceId,
        };
      } catch (parseError) {
        lastError = parseError;
        diag('round-parse-failed', {
          round: input.round,
          attempt: attempt.attempt,
          compact: attempt.compact,
          promptTraceId: response.promptTraceId,
          error: parseError instanceof Error ? parseError.message : String(parseError),
        });
        if (!isJsonParseRetryableError(parseError) || attempt.attempt === attempts.length) {
          throw parseError;
        }
      }
    } catch (error) {
      lastError = error;
      if (input.abortSignal?.aborted) throw error;
      const retryableCompact = isTimeoutLikeError(error) || isJsonParseRetryableError(error);
      diag('round-attempt-failed', {
        round: input.round,
        attempt: attempt.attempt,
        compact: attempt.compact,
        error: error instanceof Error ? error.message : String(error),
        retryableCompact,
      });
      if (!retryableCompact || attempt.attempt === attempts.length) {
        throw error;
      }
    }
  }
  throw (lastError instanceof Error ? lastError : new Error('WORLD_STUDIO_JSON_OBJECT_REQUIRED'));
}

export async function runSynthesizeDraft(
  llm: RouteCapabilityLlmInvoker,
  input: {
    selectedStartTimeId: string;
    selectedCharacters: string[];
    knowledgeGraph: WorldStudioKnowledgeGraphDraft;
    finalDraftAccumulator?: FinalDraftAccumulator;
    abortSignal?: AbortSignal;
  },
): Promise<Phase2Result> {
  validateEventGraph(input.knowledgeGraph);
  const finalDraftAccumulator = input.finalDraftAccumulator || createEmptyFinalDraftAccumulator();
  const seedState = buildPhase2SeedState({
    selectedCharacters: input.selectedCharacters,
    knowledgeGraph: input.knowledgeGraph,
    finalDraftAccumulator,
  });
  const round1 = await runRound(llm, {
    round: 'round1-produce',
    abortSignal: input.abortSignal,
    promptFactory: (compact) => buildRoundPrompt({
      round: 'round1-produce',
      selectedStartTimeId: input.selectedStartTimeId,
      selectedCharacters: input.selectedCharacters,
      knowledgeGraph: input.knowledgeGraph,
      finalDraftAccumulator,
      currentDraft: seedState,
      compact,
    }),
  });
  const round1State = materializeFullDraftState({
    base: seedState,
    selectedCharacters: input.selectedCharacters,
    knowledgeGraph: input.knowledgeGraph,
    payload: round1.payload,
  });
  const weakFieldReport = buildWeakFieldReport({
    draft: round1State,
    selectedCharacters: input.selectedCharacters,
    knowledgeGraph: input.knowledgeGraph,
    finalDraftAccumulator,
  });
  diag('round2-weak-field-report', {
    issueCount: weakFieldReport.issues.length,
    sample: weakFieldReport.issues.slice(0, 12),
  });
  let enrichDegraded = false;
  let enrichFailureReason: string | null = null;
  let round2RawText = '';
  let round2State = round1State;
  try {
    const round2 = await runRound(llm, {
      round: 'round2-enrich',
      abortSignal: input.abortSignal,
      promptFactory: (compact) => buildRoundPrompt({
        round: 'round2-enrich',
        selectedStartTimeId: input.selectedStartTimeId,
        selectedCharacters: input.selectedCharacters,
        knowledgeGraph: input.knowledgeGraph,
        finalDraftAccumulator,
        currentDraft: round1State,
        weakFieldReport,
        compact,
      }),
    });
    round2RawText = round2.rawText;
    round2State = applyEnrichmentPatch({
      base: round1State,
      selectedCharacters: input.selectedCharacters,
      patch: round2.payload as Phase2EnrichmentPatch,
    });
  } catch (error) {
    if (input.abortSignal?.aborted) {
      throw error;
    }
    enrichDegraded = true;
    enrichFailureReason = error instanceof Error ? error.message : String(error);
    round2State = round1State;
    diag('round2-degraded-continue', {
      reason: enrichFailureReason,
      weakFieldIssueCount: weakFieldReport.issues.length,
    });
  }
  const round3 = await runRound(llm, {
    round: 'round3-audit',
    abortSignal: input.abortSignal,
    promptFactory: (compact) => buildRoundPrompt({
      round: 'round3-audit',
      selectedStartTimeId: input.selectedStartTimeId,
      selectedCharacters: input.selectedCharacters,
      knowledgeGraph: input.knowledgeGraph,
      finalDraftAccumulator,
      currentDraft: round2State,
      weakFieldReport,
      compact,
      degradedMode: enrichDegraded,
    }),
  });
  const auditedState = materializeFullDraftState({
    base: round2State,
    selectedCharacters: input.selectedCharacters,
    knowledgeGraph: input.knowledgeGraph,
    payload: round3.payload,
  });
  const world = alignWorldPatch(auditedState.world || {});
  const worldview = alignWorldviewPatch(auditedState.worldview || {});
  const worldEvents = auditedState.worldEvents.length > 0
    ? auditedState.worldEvents
    : [...input.knowledgeGraph.events.primary, ...input.knowledgeGraph.events.secondary];
  const worldLorebooks = auditedState.worldLorebooks.length > 0
    ? auditedState.worldLorebooks
    : buildEventLorebooks(worldEvents);
  const futureHistoricalEvents = auditedState.futureHistoricalEvents;
  const agentDrafts = auditedState.agentDrafts;
  const worldProse = buildWorldProsePatchFromState(world, finalDraftAccumulator);
  const agentProse = buildAgentProsePatchFromState(agentDrafts, finalDraftAccumulator);
  const closureAccumulator = applyDraftPatch(finalDraftAccumulator, {
    chunkIndex: Math.max(finalDraftAccumulator.lastUpdatedChunk, input.knowledgeGraph.timeline.length),
    world,
    worldview,
    worldLorebooks,
    futureHistoricalEvents,
    agentDrafts,
    ...(worldProse ? { worldProse } : {}),
    ...(agentProse ? { agentProse } : {}),
    notes: ['phase2_round3_audit_closure'],
  }).next;
  if (!String(world.name || '').trim() || !String(world.description || '').trim()) {
    throw new Error('WORLD_STUDIO_PHASE2_INVALID_WORLD');
  }
  if (!hasPresentObjectField(worldview, 'timeModel')
    || !hasPresentObjectField(worldview, 'spaceTopology')
    || !hasPresentObjectField(worldview, 'causality')
    || !hasPresentObjectField(worldview, 'coreSystem')) {
    throw new Error('WORLD_STUDIO_PHASE2_INVALID_WORLDVIEW_REQUIRED_MODULES');
  }
  return {
    world,
    worldview,
    worldLorebooks,
    worldEvents,
    futureHistoricalEvents,
    agentDrafts,
    finalDraftAccumulator: closureAccumulator,
    enrichDegraded,
    enrichFailureReason,
    weakFieldIssues: weakFieldReport.issues,
    rawText: [round1.rawText, round2RawText, round3.rawText].filter(Boolean).join('\n\n'),
  };
}
