import { asRecord, clamp01 } from '@nimiplatform/sdk/mod/utils';
import {
  canonicalizeCharacterNames,
  normalizeZhCharacterName,
} from '../../engine/character/normalize-zh.js';
import { isSyntheticEntityName } from '../../engine/errors.js';
import type {
  CharacterPoint,
  CharacterRelationPoint,
  EventNodeDraft,
  WorldStudioCharacterProfile,
  WorldStudioKnowledgeGraphDraft,
  WorldStudioNarrativeArc,
} from '../../engine/types.js';

type Phase1GlobalRefineResult = {
  graph: WorldStudioKnowledgeGraphDraft;
  narrativeArc: WorldStudioNarrativeArc | null;
  characterNamePurity: number;
  characterProfileCoverage: number;
};

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  values.forEach((value) => {
    const next = String(value || '').trim();
    if (!next || seen.has(next)) return;
    seen.add(next);
    output.push(next);
  });
  return output;
}

function toCanonicalName(name: string, aliasMap: Record<string, string>): string {
  const direct = aliasMap[name];
  if (direct) return direct;
  const normalized = normalizeZhCharacterName(name);
  if (!normalized) return String(name || '').trim();
  return aliasMap[normalized] || normalized;
}

function dedupeRelations(relations: CharacterRelationPoint[]): CharacterRelationPoint[] {
  const map = new Map<string, CharacterRelationPoint>();
  relations.forEach((relation, index) => {
    const record = asRecord(relation);
    const source = String(record.source || '').trim();
    const target = String(record.target || '').trim();
    const relationType = String(record.relation || '').trim();
    if (!source || !target) return;
    const key = `${source}->${target}:${relationType || '-'}:${index}`;
    if (!map.has(key)) {
      map.set(key, relation);
    }
  });
  return Array.from(map.values());
}

function normalizeCharacterPoints(
  characters: CharacterPoint[],
  canonicalNames: string[],
  aliasMap: Record<string, string>,
): CharacterPoint[] {
  const byCanonical = new Map<string, CharacterPoint>();
  characters.forEach((item) => {
    const record = asRecord(item);
    const rawName = String(record.name || '').trim();
    if (!rawName) return;
    const canonicalName = toCanonicalName(rawName, aliasMap);
    if (!canonicalName) return;
    const previous = asRecord(byCanonical.get(canonicalName));
    byCanonical.set(canonicalName, {
      ...previous,
      ...record,
      id: String(previous.id || record.id || `char:${canonicalName}`),
      name: canonicalName,
      summary: String(previous.summary || record.summary || record.description || ''),
      significance: clamp01(Math.max(
        Number(previous.significance) || 0,
        Number(record.significance) || 0.5,
      ), 0.5),
    });
  });
  canonicalNames.forEach((name) => {
    if (byCanonical.has(name)) return;
    byCanonical.set(name, {
      id: `char:${name}`,
      name,
      summary: '',
      significance: 0.45,
    });
  });
  return Array.from(byCanonical.values());
}

function normalizeEventCharacters(
  events: EventNodeDraft[],
  aliasMap: Record<string, string>,
): EventNodeDraft[] {
  return events.map((event) => ({
    ...event,
    characterRefs: uniqueStrings(
      (event.characterRefs || [])
        .map((name) => toCanonicalName(name, aliasMap))
        .filter(Boolean),
    ),
  }));
}

function normalizeCharacterRelations(
  relations: CharacterRelationPoint[],
  aliasMap: Record<string, string>,
): CharacterRelationPoint[] {
  const normalized = relations
    .map((item) => asRecord(item))
    .map((item) => {
      const source = toCanonicalName(String(item.source || ''), aliasMap);
      const target = toCanonicalName(String(item.target || ''), aliasMap);
      if (!source || !target) return null;
      return {
        ...item,
        source,
        target,
      };
    })
    .filter((item): item is { source: string; target: string } => Boolean(item));
  return dedupeRelations(normalized as CharacterRelationPoint[]);
}

function buildNarrativeArc(primaryEvents: EventNodeDraft[]): WorldStudioNarrativeArc | null {
  if (primaryEvents.length === 0) return null;
  const sorted = [...primaryEvents];
  const openingEvent = sorted[0]!;
  const climaxEvent = [...sorted].sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0] || openingEvent;
  const resolutionEvent = sorted[sorted.length - 1] || openingEvent;
  const middleEvents = sorted.slice(1, Math.max(2, sorted.length - 1));
  const opening = (openingEvent.cause || openingEvent.summary || openingEvent.title || '').trim();
  const development = middleEvents
    .map((event) => event.process || event.summary || event.title)
    .filter(Boolean)
    .slice(0, 3)
    .join('；');
  const climax = (climaxEvent.result || climaxEvent.process || climaxEvent.summary || climaxEvent.title || '').trim();
  const resolution = (resolutionEvent.result || resolutionEvent.summary || resolutionEvent.title || '').trim();
  const summary = [openingEvent.title, climaxEvent.title, resolutionEvent.title].filter(Boolean).join(' -> ');
  const hasContent = Boolean(opening || development || climax || resolution || summary);
  if (!hasContent) return null;
  return {
    summary: summary || [opening, climax, resolution].filter(Boolean).join('；'),
    opening,
    development,
    climax,
    resolution,
  };
}

function buildCharacterProfiles(graph: WorldStudioKnowledgeGraphDraft): WorldStudioCharacterProfile[] {
  const allEvents = [...graph.events.primary, ...graph.events.secondary];
  const characterByName = new Map<string, Record<string, unknown>>();
  graph.characters.forEach((item) => {
    const record = asRecord(item);
    const name = String(record.name || '').trim();
    if (!name) return;
    characterByName.set(name, record);
  });

  const eventsByCharacter = new Map<string, EventNodeDraft[]>();
  allEvents.forEach((event) => {
    (event.characterRefs || []).forEach((name) => {
      if (!name) return;
      const list = eventsByCharacter.get(name) || [];
      list.push(event);
      eventsByCharacter.set(name, list);
    });
  });

  const relationLinesByCharacter = new Map<string, string[]>();
  graph.characterRelations.forEach((item) => {
    const record = asRecord(item);
    const source = String(record.source || '').trim();
    const target = String(record.target || '').trim();
    const relation = String(record.relation || '').trim();
    if (!source || !target) return;
    const sourceLine = `${target}${relation ? `: ${relation}` : ''}`;
    const targetLine = `${source}${relation ? `: ${relation}` : ''}`;
    relationLinesByCharacter.set(source, [...(relationLinesByCharacter.get(source) || []), sourceLine]);
    relationLinesByCharacter.set(target, [...(relationLinesByCharacter.get(target) || []), targetLine]);
  });

  const names = uniqueStrings([
    ...graph.characters.map((item) => String(asRecord(item).name || '').trim()),
    ...allEvents.flatMap((event) => event.characterRefs || []),
  ]).slice(0, 32);

  return names.map((name) => {
    const record = asRecord(characterByName.get(name));
    const eventRefs = eventsByCharacter.get(name) || [];
    const summary = String(record.summary || record.description || eventRefs[0]?.summary || '').trim();
    const background = String(record.background || summary || eventRefs[0]?.process || eventRefs[0]?.summary || '').trim();
    const motivation = String(
      record.motivation
      || eventRefs.find((event) => String(event.cause || '').trim())?.cause
      || eventRefs.find((event) => String(event.result || '').trim())?.result
      || '',
    ).trim();
    const relationships = uniqueStrings([
      ...(Array.isArray(record.relationships)
        ? record.relationships.map((item) => String(item || ''))
        : []),
      ...(relationLinesByCharacter.get(name) || []),
    ]).slice(0, 8);
    const keyEvents = uniqueStrings(eventRefs.map((event) => String(event.title || '').trim())).slice(0, 8);
    const aliases = Object.entries(graph.characterAliasMap || {})
      .filter(([, canonical]) => canonical === name)
      .map(([alias]) => alias)
      .filter((alias) => alias !== name)
      .slice(0, 8);
    return {
      name,
      aliases,
      summary,
      background,
      motivation,
      relationships,
      keyEvents,
    };
  });
}

function computeCharacterProfileCoverage(profiles: WorldStudioCharacterProfile[]): number {
  if (profiles.length === 0) return 0;
  const completeCount = profiles.filter((profile) => {
    return Boolean(profile.background.trim())
      && Boolean(profile.motivation.trim())
      && profile.relationships.length > 0;
  }).length;
  return completeCount / profiles.length;
}

export function runPhase1GlobalRefine(
  graph: WorldStudioKnowledgeGraphDraft,
): Phase1GlobalRefineResult {
  const rawCharacterNames = uniqueStrings([
    ...graph.characters.map((item) => String(asRecord(item).name || '').trim()),
    ...graph.events.primary.flatMap((event) => event.characterRefs || []),
    ...graph.events.secondary.flatMap((event) => event.characterRefs || []),
    ...graph.characterRelations.flatMap((item) => {
      const record = asRecord(item);
      return [String(record.source || '').trim(), String(record.target || '').trim()];
    }),
  ].filter((name) => !isSyntheticEntityName(name)));
  const canonicalization = canonicalizeCharacterNames(rawCharacterNames);
  const aliasMap = {
    ...(graph.characterAliasMap || {}),
    ...canonicalization.aliasToCanonical,
  };
  const normalizedPrimary = normalizeEventCharacters(graph.events.primary, aliasMap);
  const normalizedSecondary = normalizeEventCharacters(graph.events.secondary, aliasMap);
  const normalizedRelations = normalizeCharacterRelations(graph.characterRelations, aliasMap);
  const normalizedCharacters = normalizeCharacterPoints(graph.characters, canonicalization.canonicalNames, aliasMap);
  const narrativeArc = buildNarrativeArc(normalizedPrimary);

  const refinedGraph: WorldStudioKnowledgeGraphDraft = {
    ...graph,
    characters: normalizedCharacters,
    events: {
      primary: normalizedPrimary,
      secondary: normalizedSecondary,
    },
    characterRelations: normalizedRelations,
    narrativeArc,
    characterAliasMap: aliasMap,
  };
  const characterProfiles = buildCharacterProfiles(refinedGraph);
  refinedGraph.characterProfiles = characterProfiles;

  return {
    graph: refinedGraph,
    narrativeArc,
    characterNamePurity: canonicalization.purity,
    characterProfileCoverage: computeCharacterProfileCoverage(characterProfiles),
  };
}
