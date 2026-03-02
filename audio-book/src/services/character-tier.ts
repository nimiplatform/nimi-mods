import type { CharacterProfile, CharacterTier, CharacterTierThresholds } from '../types.js';
import { DEFAULT_TIER_THRESHOLDS } from '../types.js';

/**
 * Compute the tier for a single character based on their segment count.
 */
export function computeCharacterTier(
  segmentCount: number,
  thresholds: CharacterTierThresholds = DEFAULT_TIER_THRESHOLDS,
): CharacterTier {
  if (segmentCount >= thresholds.majorMin) return 'major';
  if (segmentCount >= thresholds.supportingMin) return 'supporting';
  return 'minor';
}

/**
 * Classify all characters and return updated profiles with tier assigned.
 * Narrator is always classified as 'major' regardless of segment count.
 */
export function classifyAllCharacters(
  characters: CharacterProfile[],
  thresholds: CharacterTierThresholds = DEFAULT_TIER_THRESHOLDS,
): CharacterProfile[] {
  return characters.map((ch) => ({
    ...ch,
    tier: ch.name === 'narrator'
      ? 'major' as const
      : computeCharacterTier(ch.segmentCount, thresholds),
  }));
}
