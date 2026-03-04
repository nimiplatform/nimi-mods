import {
  PRIMARY_ARCHETYPES,
  SECONDARY_TRAITS,
  RELATIONSHIP_MODES,
  FORMALITY_VALUES,
  SENTIMENT_VALUES,
  MINTYOU_REASON,
  type DnaPrimaryType,
  type DnaSecondaryTrait,
} from '../contracts.js';
import { SCENARIO_BANK } from '../data/scenario-bank.js';
import type { TraitExtractionResult, MintYouResult } from '../types.js';

function createScoreMap<T extends string>(keys: readonly T[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const key of keys) {
    map[key] = 0;
  }
  return map;
}

// Conflict map: primary archetype -> secondary traits that conflict.
// A CARING persona shouldn't have SARCASTIC as secondary, etc.
const PRIMARY_SECONDARY_CONFLICTS: Record<DnaPrimaryType, DnaSecondaryTrait[]> = {
  CARING: ['SARCASTIC', 'REBELLIOUS'],
  PLAYFUL: ['REALISTIC', 'WISE'],
  INTELLECTUAL: ['INNOCENT', 'DRAMATIC'],
  CONFIDENT: ['INNOCENT', 'GENTLE'],
  MYSTERIOUS: ['DRAMATIC', 'HUMOROUS'],
  ROMANTIC: ['SARCASTIC', 'DIRECT'],
};

/**
 * Resolve the highest-scoring key with scenario-order tie-breaking.
 *
 * The `firstSeenOrder` map tracks when each key first appeared by scenario
 * index. When two keys have equal scores, the one first seen in an earlier
 * scenario wins (per MY-PROF-001 / trait-dimensions.yaml tie_breaker).
 */
function resolveMaxWithTieBreak<T extends string>(
  scores: Record<string, number>,
  validKeys: readonly T[],
  firstSeenOrder: Map<string, number>,
  defaultValue: T,
): T {
  let maxKey = defaultValue;
  let maxScore = -Infinity;
  let maxFirstSeen = Infinity;

  for (const key of validKeys) {
    const score = scores[key] ?? 0;
    const firstSeen = firstSeenOrder.get(key) ?? Infinity;

    if (score > maxScore || (score === maxScore && firstSeen < maxFirstSeen)) {
      maxScore = score;
      maxKey = key;
      maxFirstSeen = firstSeen;
    }
  }
  return maxKey;
}

/**
 * Select top 2-3 secondary traits by score, excluding traits that conflict
 * with the resolved dnaPrimary (per MY-PROF-002).
 */
function resolveSecondaryTraits(
  scores: Record<string, number>,
  validKeys: readonly DnaSecondaryTrait[],
  dnaPrimary: DnaPrimaryType,
  min: number,
  max: number,
): DnaSecondaryTrait[] {
  const conflicts = new Set(PRIMARY_SECONDARY_CONFLICTS[dnaPrimary] ?? []);

  const entries = validKeys
    .filter(key => !conflicts.has(key))
    .map(key => ({ key, score: scores[key] ?? 0 }))
    .filter(e => e.score > 0)
    .sort((a, b) => b.score - a.score);

  if (entries.length <= min) {
    return entries.map(e => e.key);
  }

  return entries.slice(0, max).map(e => e.key);
}

export function extractTraits(
  scenarioChoices: Record<string, string>,
): MintYouResult<TraitExtractionResult> {
  const primaryScores = createScoreMap(PRIMARY_ARCHETYPES);
  const secondaryScores = createScoreMap(SECONDARY_TRAITS);
  const relationshipScores = createScoreMap(RELATIONSHIP_MODES);
  const formalityScores = createScoreMap(FORMALITY_VALUES);
  const sentimentScores = createScoreMap(SENTIMENT_VALUES);

  // Track first-seen scenario index for tie-breaking (MY-PROF-001)
  const primaryFirstSeen = new Map<string, number>();
  const relationshipFirstSeen = new Map<string, number>();

  let processedCount = 0;

  for (let scenarioIdx = 0; scenarioIdx < SCENARIO_BANK.length; scenarioIdx++) {
    const scenario = SCENARIO_BANK[scenarioIdx]!;
    const chosenId = scenarioChoices[scenario.id];
    if (!chosenId) continue;

    const choice = scenario.choices.find(c => c.id === chosenId);
    if (!choice) continue;

    processedCount++;

    for (const [key, weight] of Object.entries(choice.traitWeights)) {
      const parts = key.split('.');

      if (parts[0] === 'primary' && parts[1]) {
        primaryScores[parts[1]] = (primaryScores[parts[1]] ?? 0) + weight;
        if (!primaryFirstSeen.has(parts[1])) {
          primaryFirstSeen.set(parts[1], scenarioIdx);
        }
      } else if (parts[0] === 'relationship' && parts[1]) {
        relationshipScores[parts[1]] = (relationshipScores[parts[1]] ?? 0) + weight;
        if (!relationshipFirstSeen.has(parts[1])) {
          relationshipFirstSeen.set(parts[1], scenarioIdx);
        }
      } else if (parts[0] === 'communication' && parts[1] === 'formality' && parts[2]) {
        formalityScores[parts[2]] = (formalityScores[parts[2]] ?? 0) + weight;
      } else if (parts[0] === 'communication' && parts[1] === 'sentiment' && parts[2]) {
        sentimentScores[parts[2]] = (sentimentScores[parts[2]] ?? 0) + weight;
      } else if (parts[0] === 'secondary' && parts[1]) {
        secondaryScores[parts[1]] = (secondaryScores[parts[1]] ?? 0) + weight;
      }
    }
  }

  if (processedCount < 7) {
    return {
      ok: false,
      error: {
        reasonCode: MINTYOU_REASON.TRAIT_EXTRACTION_FAILED,
        message: `Only ${processedCount} scenarios were processed. At least 7 are required.`,
        actionHint: 'Verify scenario data integrity and retry extraction.',
      },
    };
  }

  // Resolve primary with scenario-order tie-break (MY-PROF-001)
  const dnaPrimary = resolveMaxWithTieBreak(
    primaryScores, PRIMARY_ARCHETYPES, primaryFirstSeen, 'CARING',
  );

  // Resolve secondary, filtering conflicts with resolved primary (MY-PROF-002)
  const dnaSecondary = resolveSecondaryTraits(
    secondaryScores, SECONDARY_TRAITS, dnaPrimary, 2, 3,
  );

  // Resolve relationship with scenario-order tie-break
  const relationshipMode = resolveMaxWithTieBreak(
    relationshipScores, RELATIONSHIP_MODES, relationshipFirstSeen, 'SECURE',
  );

  // Formality: default casual on tie (per trait-dimensions.yaml)
  const formality = resolveMaxWithTieBreak(
    formalityScores, FORMALITY_VALUES, new Map(), 'casual',
  );

  // Sentiment: default neutral on tie (per trait-dimensions.yaml)
  const sentiment = resolveMaxWithTieBreak(
    sentimentScores, SENTIMENT_VALUES, new Map(), 'neutral',
  );

  return {
    ok: true,
    data: {
      dnaPrimary,
      dnaSecondary,
      relationshipMode,
      formality,
      sentiment,
      scores: {
        primary: { ...primaryScores },
        secondary: { ...secondaryScores },
        relationship: { ...relationshipScores },
        formality: { ...formalityScores },
        sentiment: { ...sentimentScores },
      },
    },
  };
}
