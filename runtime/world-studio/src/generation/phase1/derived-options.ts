import { toCharacterCandidates } from '../../engine/merge.js';
import { canonicalizeCharacterNames } from '../../engine/character/normalize-zh.js';
import { buildStartTimeOptionsFromEvents } from '../../services/temporal-order.js';
import type { Phase1Character, Phase1Option, WorldStudioKnowledgeGraphDraft } from '../../engine/types.js';

export function deriveStartTimeOptions(graph: WorldStudioKnowledgeGraphDraft): Phase1Option[] {
  return buildStartTimeOptionsFromEvents(graph.events);
}

export function deriveCharacterCandidates(graph: WorldStudioKnowledgeGraphDraft): Phase1Character[] {
  const graphCandidates = toCharacterCandidates(graph.characters);
  if (graphCandidates.length === 0) {
    return [];
  }
  const canonicalized = canonicalizeCharacterNames(graphCandidates.map((item) => item.name));
  const byName = new Map(graphCandidates.map((item) => [item.name, item]));
  return canonicalized.canonicalNames.map((name) => {
    const matched = byName.get(name)
      || graphCandidates.find((item) => canonicalized.aliasToCanonical[item.name] === name)
      || null;
    return {
      name,
      summary: matched?.summary || '',
      significance: matched?.significance ?? 0.5,
    };
  }).slice(0, 24);
}
