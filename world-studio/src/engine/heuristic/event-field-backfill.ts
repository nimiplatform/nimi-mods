import { asRecord } from '@nimiplatform/sdk/mod/utils';
import { isSyntheticEntityName } from '../errors.js';
import type {
  ChunkExtraction,
  EventNodeDraft,
  WorldStudioKnowledgeGraphDraft,
} from '../types.js';
import { deriveNeedsEvidence } from '../../services/event-horizon.js';

type TextSearchIndex = {
  raw: string;
  lower: string;
};

const TIME_SNIPPET_PATTERN =
  /(?:公元前?\d{1,4}年|(?:18|19|20)\d{2}年?(?:\d{1,2}月(?:\d{1,2}[日号])?)?|(?:18|19|20)\d{2}(?:-\d{1,2}(?:-\d{1,2})?)?|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+(?:18|19|20)\d{2}|第[0-9一二三四五六七八九十百千〇零两]+(?:天|日|周|月|年)|[0-9一二三四五六七八九十百千〇零两]+(?:天|日|周|月|年)后|翌日|次日|当晚|同年|同月|当日|次年|隔日)/gi;

function normalizeText(value: unknown): string {
  return String(value || '').trim();
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  values.forEach((value) => {
    const normalized = normalizeText(value);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    output.push(normalized);
  });
  return output;
}

function createTextSearchIndex(text: string): TextSearchIndex {
  const raw = String(text || '');
  return {
    raw,
    lower: raw.toLowerCase(),
  };
}

function hasCjk(text: string): boolean {
  return /[\u3400-\u9fff]/.test(text);
}

function containsInText(index: TextSearchIndex, needle: string): boolean {
  const normalizedNeedle = normalizeText(needle);
  if (!normalizedNeedle) return false;
  if (hasCjk(normalizedNeedle)) {
    return index.raw.includes(normalizedNeedle);
  }
  return index.lower.includes(normalizedNeedle.toLowerCase());
}

function sanitizeExistingEntityRefs(refs: string[]): string[] {
  return uniqueStrings(refs)
    .filter((name) => !isSyntheticEntityName(name));
}

function sortCandidates(candidates: string[]): string[] {
  return [...candidates].sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    return a.localeCompare(b);
  });
}

function extractMentionsFromScope(input: {
  eventScope: TextSearchIndex;
  source: TextSearchIndex;
  candidates: string[];
  limit: number;
}): string[] {
  const mentions: string[] = [];
  for (const candidate of sortCandidates(input.candidates)) {
    if (!containsInText(input.eventScope, candidate)) continue;
    if (!containsInText(input.source, candidate)) continue;
    mentions.push(candidate);
    if (mentions.length >= input.limit) break;
  }
  return mentions;
}

function buildEventScope(event: EventNodeDraft): string {
  const evidenceExcerpts = (Array.isArray(event.evidenceRefs) ? event.evidenceRefs : [])
    .map((item) => normalizeText(item.excerpt))
    .filter(Boolean);
  return uniqueStrings([
    normalizeText(event.title),
    normalizeText(event.summary),
    normalizeText(event.cause),
    normalizeText(event.process),
    normalizeText(event.result),
    ...evidenceExcerpts,
  ]).join('\n');
}

function extractTimeSnippets(text: string): string[] {
  const matches = String(text || '').match(TIME_SNIPPET_PATTERN) || [];
  return uniqueStrings(matches.map((item) => normalizeText(item)));
}

function normalizeTokens(text: string): Set<string> {
  const matches = String(text || '').match(/[\u4e00-\u9fff]{1,4}|[a-zA-Z0-9]{2,}/g) || [];
  const normalized = matches
    .map((token) => (hasCjk(token) ? token : token.toLowerCase()))
    .map((token) => normalizeText(token))
    .filter((token) => token.length > 1);
  return new Set(normalized);
}

function lexicalOverlapScore(a: string, b: string): number {
  const left = normalizeTokens(a);
  const right = normalizeTokens(b);
  if (left.size === 0 || right.size === 0) return 0;
  let score = 0;
  for (const token of left) {
    if (right.has(token)) score += 1;
  }
  return score;
}

function collectCharacterCandidates(input: {
  characters: Array<Record<string, unknown>>;
  events: { primary: EventNodeDraft[]; secondary: EventNodeDraft[] };
  characterRelations: Array<Record<string, unknown>>;
}): string[] {
  const fromCharacters = input.characters
    .map((item) => normalizeText(asRecord(item).name));
  const fromEvents = [...input.events.primary, ...input.events.secondary]
    .flatMap((event) => Array.isArray(event.characterRefs) ? event.characterRefs : [])
    .map((item) => normalizeText(item));
  const fromRelations = input.characterRelations.flatMap((item) => {
    const relation = asRecord(item);
    return [normalizeText(relation.source), normalizeText(relation.target)];
  });
  return uniqueStrings([
    ...fromCharacters,
    ...fromEvents,
    ...fromRelations,
  ]).filter((name) => !isSyntheticEntityName(name));
}

function collectLocationCandidates(input: {
  locations: Array<Record<string, unknown>>;
  events: { primary: EventNodeDraft[]; secondary: EventNodeDraft[] };
}): string[] {
  const fromLocations = input.locations
    .map((item) => normalizeText(asRecord(item).name));
  const fromEvents = [...input.events.primary, ...input.events.secondary]
    .flatMap((event) => Array.isArray(event.locationRefs) ? event.locationRefs : [])
    .map((item) => normalizeText(item));
  return uniqueStrings([
    ...fromLocations,
    ...fromEvents,
  ]).filter((name) => !isSyntheticEntityName(name));
}

function collectTimelineCandidates(input: {
  timeline: Array<Record<string, unknown>>;
  events: { primary: EventNodeDraft[]; secondary: EventNodeDraft[] };
}): string[] {
  const fromTimeline = input.timeline.flatMap((item) => {
    const point = asRecord(item);
    return [
      normalizeText(point.label),
      normalizeText(point.time),
    ];
  });
  const fromEvents = [...input.events.primary, ...input.events.secondary]
    .map((event) => normalizeText(event.timeRef));
  return uniqueStrings([...fromTimeline, ...fromEvents]);
}

function resolveFallbackParentEventId(input: {
  event: EventNodeDraft;
  primary: EventNodeDraft[];
  primaryIdSet: Set<string>;
}): string | null {
  if (input.primary.length === 0) return null;
  const currentParent = normalizeText(input.event.parentEventId);
  if (currentParent && input.primaryIdSet.has(currentParent)) return currentParent;

  const validDependencyParent = uniqueStrings(
    (Array.isArray(input.event.dependsOnEventIds) ? input.event.dependsOnEventIds : [])
      .map((item) => normalizeText(item)),
  ).find((eventId) => input.primaryIdSet.has(eventId));
  if (validDependencyParent) return validDependencyParent;

  const eventText = buildEventScope(input.event);
  const eventTimeRef = normalizeText(input.event.timeRef);
  const scored = input.primary.map((primary, index) => {
    const primaryText = buildEventScope(primary);
    const titleBoost = normalizeText(primary.title) && eventText.includes(primary.title) ? 2 : 0;
    const timeBoost = eventTimeRef && eventTimeRef === normalizeText(primary.timeRef) ? 4 : 0;
    const lexical = lexicalOverlapScore(eventText, primaryText);
    return {
      primaryId: normalizeText(primary.id),
      score: titleBoost + timeBoost + lexical,
      index,
    };
  });
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.index - b.index;
  });
  const best = scored[0];
  if (!best) return null;
  if (best.score > 0) return best.primaryId;
  return normalizeText(input.primary[0]?.id) || null;
}

function resolveTimeRef(input: {
  event: EventNodeDraft;
  eventScope: TextSearchIndex;
  source: TextSearchIndex;
  timelineCandidates: string[];
  timelineCandidateSet: Set<string>;
  parentTimeRef?: string | null;
}): string {
  const existing = normalizeText(input.event.timeRef);
  if (existing) return existing;

  const timelineMatch = input.timelineCandidates.find((candidate) => (
    containsInText(input.eventScope, candidate) && containsInText(input.source, candidate)
  ));
  if (timelineMatch) return timelineMatch;

  const extracted = extractTimeSnippets(input.eventScope.raw);
  const extractedMatch = extracted.find((candidate) => containsInText(input.source, candidate));
  if (extractedMatch) return extractedMatch;

  const parentTime = normalizeText(input.parentTimeRef);
  if (!parentTime) return '';
  if (containsInText(input.source, parentTime)) return parentTime;
  if (input.timelineCandidateSet.has(parentTime)) return parentTime;
  return '';
}

function pruneInvalidDependencies(graph: {
  primary: EventNodeDraft[];
  secondary: EventNodeDraft[];
}): {
  primary: EventNodeDraft[];
  secondary: EventNodeDraft[];
} {
  const allEvents = [...graph.primary, ...graph.secondary];
  const idSet = new Set(allEvents.map((item) => normalizeText(item.id)).filter(Boolean));
  const dependencyMap = new Map<string, string[]>();
  allEvents.forEach((event) => {
    const eventId = normalizeText(event.id);
    if (!eventId) return;
    const dependencies = uniqueStrings(
      (Array.isArray(event.dependsOnEventIds) ? event.dependsOnEventIds : [])
        .map((item) => normalizeText(item)),
    ).filter((depId) => depId !== eventId && idSet.has(depId));
    dependencyMap.set(eventId, dependencies);
  });

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const breakCycles = (eventId: string): void => {
    if (visited.has(eventId)) return;
    visiting.add(eventId);
    const deps = dependencyMap.get(eventId) || [];
    const cleaned: string[] = [];
    deps.forEach((depId) => {
      if (!idSet.has(depId)) return;
      if (visiting.has(depId)) return;
      if (!visited.has(depId)) breakCycles(depId);
      cleaned.push(depId);
    });
    dependencyMap.set(eventId, uniqueStrings(cleaned));
    visiting.delete(eventId);
    visited.add(eventId);
  };

  Array.from(idSet.values()).forEach((eventId) => breakCycles(eventId));

  const sanitize = (event: EventNodeDraft): EventNodeDraft => ({
    ...event,
    dependsOnEventIds: dependencyMap.get(normalizeText(event.id)) || [],
  });
  return {
    primary: graph.primary.map(sanitize),
    secondary: graph.secondary.map(sanitize),
  };
}

function backfillEventFieldsInternal(input: {
  timeline: Array<Record<string, unknown>>;
  locations: Array<Record<string, unknown>>;
  characters: Array<Record<string, unknown>>;
  characterRelations: Array<Record<string, unknown>>;
  events: { primary: EventNodeDraft[]; secondary: EventNodeDraft[] };
  sourceText: string;
}): { primary: EventNodeDraft[]; secondary: EventNodeDraft[] } {
  const source = createTextSearchIndex(input.sourceText);
  const characterCandidates = collectCharacterCandidates(input);
  const locationCandidates = collectLocationCandidates(input);
  const timelineCandidates = collectTimelineCandidates(input);
  const timelineCandidateSet = new Set(timelineCandidates);

  const normalizedPrimary = input.events.primary.map((event) => {
    const scope = createTextSearchIndex(buildEventScope(event));
    const existingCharacterRefs = sanitizeExistingEntityRefs(
      Array.isArray(event.characterRefs) ? event.characterRefs : [],
    );
    const existingLocationRefs = sanitizeExistingEntityRefs(
      Array.isArray(event.locationRefs) ? event.locationRefs : [],
    );
    const characterRefs = existingCharacterRefs.length > 0
      ? existingCharacterRefs
      : extractMentionsFromScope({
        eventScope: scope,
        source,
        candidates: characterCandidates,
        limit: 4,
      });
    const locationRefs = existingLocationRefs.length > 0
      ? existingLocationRefs
      : extractMentionsFromScope({
        eventScope: scope,
        source,
        candidates: locationCandidates,
        limit: 3,
      });
    const timeRef = resolveTimeRef({
      event,
      eventScope: scope,
      source,
      timelineCandidates,
      timelineCandidateSet,
    });
    const hasEvidence = Array.isArray(event.evidenceRefs) && event.evidenceRefs.length > 0;
    return {
      ...event,
      level: 'PRIMARY' as const,
      parentEventId: null,
      characterRefs,
      locationRefs,
      timeRef,
      needsEvidence: deriveNeedsEvidence({
        ...event,
        level: 'PRIMARY',
      }),
    };
  });

  const primaryIdSet = new Set(normalizedPrimary.map((item) => normalizeText(item.id)).filter(Boolean));
  const primaryById = new Map(normalizedPrimary.map((item) => [normalizeText(item.id), item] as const));

  const normalizedSecondary = input.events.secondary.map((event) => {
    const parentEventId = resolveFallbackParentEventId({
      event,
      primary: normalizedPrimary,
      primaryIdSet,
    });
    const scope = createTextSearchIndex(buildEventScope(event));
    const existingCharacterRefs = sanitizeExistingEntityRefs(
      Array.isArray(event.characterRefs) ? event.characterRefs : [],
    );
    const existingLocationRefs = sanitizeExistingEntityRefs(
      Array.isArray(event.locationRefs) ? event.locationRefs : [],
    );
    const characterRefs = existingCharacterRefs.length > 0
      ? existingCharacterRefs
      : extractMentionsFromScope({
        eventScope: scope,
        source,
        candidates: characterCandidates,
        limit: 4,
      });
    const locationRefs = existingLocationRefs.length > 0
      ? existingLocationRefs
      : extractMentionsFromScope({
        eventScope: scope,
        source,
        candidates: locationCandidates,
        limit: 3,
      });
    const parentTimeRef = parentEventId
      ? normalizeText(primaryById.get(parentEventId)?.timeRef)
      : '';
    const timeRef = resolveTimeRef({
      event,
      eventScope: scope,
      source,
      timelineCandidates,
      timelineCandidateSet,
      parentTimeRef,
    });
    const selfEventId = normalizeText(event.id);
    const existingDeps = uniqueStrings(
      (Array.isArray(event.dependsOnEventIds) ? event.dependsOnEventIds : [])
        .map((item) => normalizeText(item)),
    ).filter((depId) => depId !== selfEventId);
    const dependsOnEventIds = (
      existingDeps.length > 0
        ? existingDeps
        : (parentEventId ? [parentEventId] : [])
    );
    const hasEvidence = Array.isArray(event.evidenceRefs) && event.evidenceRefs.length > 0;
    return {
      ...event,
      level: 'SECONDARY' as const,
      parentEventId,
      characterRefs,
      locationRefs,
      timeRef,
      dependsOnEventIds,
      needsEvidence: deriveNeedsEvidence({
        ...event,
        level: 'SECONDARY',
      }),
    };
  });

  const pruned = pruneInvalidDependencies({
    primary: normalizedPrimary,
    secondary: normalizedSecondary,
  });

  return {
    primary: pruned.primary.map((event) => {
      return {
        ...event,
        needsEvidence: deriveNeedsEvidence(event),
      };
    }),
    secondary: pruned.secondary,
  };
}

export function backfillChunkExtractionEventFields(
  extraction: ChunkExtraction,
  sourceText: string,
): ChunkExtraction {
  const events = backfillEventFieldsInternal({
    timeline: extraction.timeline,
    locations: extraction.locations,
    characters: extraction.characters,
    characterRelations: extraction.characterRelations,
    events: extraction.events,
    sourceText,
  });
  return {
    ...extraction,
    events,
  };
}

export function backfillKnowledgeGraphEventFields(
  graph: WorldStudioKnowledgeGraphDraft,
  sourceText: string,
): WorldStudioKnowledgeGraphDraft {
  const events = backfillEventFieldsInternal({
    timeline: graph.timeline,
    locations: graph.locations,
    characters: graph.characters,
    characterRelations: graph.characterRelations,
    events: graph.events,
    sourceText,
  });
  return {
    ...graph,
    events,
  };
}
