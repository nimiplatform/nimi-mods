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
import { mintYouMessage } from '../i18n/messages.js';
import type { InterviewTurnSignal, TraitExtractionResult, MintYouResult } from '../types.js';

export function createScoreMap<T extends string>(keys: readonly T[]): Record<string, number> {
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
 * Resolve the highest-scoring key with order-based tie-breaking.
 *
 * The `firstSeenOrder` map tracks when each key first appeared by turn
 * index. When two keys have equal scores, the one first seen in an earlier
 * turn wins (per MY-PROF-001 / trait-dimensions.yaml tie_breaker).
 */
export function resolveMaxWithTieBreak<T extends string>(
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
export function resolveSecondaryTraits(
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

/**
 * Extract traits from interview signals (replaces old scenario-based extraction).
 *
 * @param signals - All accumulated interview turn signals
 * @param options.allowIncomplete - If true, allows extraction with < 7 valid signals
 *   (used for degraded end at turn 12). Missing dimensions use defaults.
 */
export function extractTraitsFromInterview(
  signals: InterviewTurnSignal[],
  options?: { allowIncomplete?: boolean },
): MintYouResult<TraitExtractionResult & { degraded?: boolean }> {
  const primaryScores = createScoreMap(PRIMARY_ARCHETYPES);
  const secondaryScores = createScoreMap(SECONDARY_TRAITS);
  const relationshipScores = createScoreMap(RELATIONSHIP_MODES);
  const formalityScores = createScoreMap(FORMALITY_VALUES);
  const sentimentScores = createScoreMap(SENTIMENT_VALUES);

  // Track first-seen turn index for tie-breaking
  const primaryFirstSeen = new Map<string, number>();
  const relationshipFirstSeen = new Map<string, number>();

  // Count unique turns that contributed signals
  const turnsWithSignals = new Set<number>();

  for (const signal of signals) {
    const parts = signal.key.split('.');

    if (parts[0] === 'primary' && parts[1]) {
      primaryScores[parts[1]] = (primaryScores[parts[1]] ?? 0) + signal.weight;
      if (!primaryFirstSeen.has(parts[1])) {
        primaryFirstSeen.set(parts[1], signal.turnIndex);
      }
    } else if (parts[0] === 'relationship' && parts[1]) {
      relationshipScores[parts[1]] = (relationshipScores[parts[1]] ?? 0) + signal.weight;
      if (!relationshipFirstSeen.has(parts[1])) {
        relationshipFirstSeen.set(parts[1], signal.turnIndex);
      }
    } else if (parts[0] === 'communication' && parts[1] === 'formality' && parts[2]) {
      formalityScores[parts[2]] = (formalityScores[parts[2]] ?? 0) + signal.weight;
    } else if (parts[0] === 'communication' && parts[1] === 'sentiment' && parts[2]) {
      sentimentScores[parts[2]] = (sentimentScores[parts[2]] ?? 0) + signal.weight;
    } else if (parts[0] === 'secondary' && parts[1]) {
      secondaryScores[parts[1]] = (secondaryScores[parts[1]] ?? 0) + signal.weight;
    }

    turnsWithSignals.add(signal.turnIndex);
  }

  const validTurnCount = turnsWithSignals.size;

  if (validTurnCount < 7 && !options?.allowIncomplete) {
    return {
      ok: false,
      error: {
        reasonCode: MINTYOU_REASON.INTERVIEW_INCOMPLETE,
        message: mintYouMessage(
          'Messages.interviewIncomplete',
          'Only {{count}} valid interview turns completed. At least 7 are required.',
          { count: validTurnCount },
        ),
        actionHint: mintYouMessage(
          'Messages.continueInterview',
          'Continue the interview conversation.',
        ),
      },
    };
  }

  const dnaPrimary = resolveMaxWithTieBreak(
    primaryScores, PRIMARY_ARCHETYPES, primaryFirstSeen, 'CARING',
  );

  const dnaSecondary = resolveSecondaryTraits(
    secondaryScores, SECONDARY_TRAITS, dnaPrimary, 2, 3,
  );

  const relationshipMode = resolveMaxWithTieBreak(
    relationshipScores, RELATIONSHIP_MODES, relationshipFirstSeen, 'SECURE',
  );

  const formality = resolveMaxWithTieBreak(
    formalityScores, FORMALITY_VALUES, new Map(), 'casual',
  );

  const sentiment = resolveMaxWithTieBreak(
    sentimentScores, SENTIMENT_VALUES, new Map(), 'neutral',
  );

  const degraded = validTurnCount < 7;

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
      ...(degraded ? { degraded: true } : {}),
    },
  };
}
