import { describe, it, expect } from 'vitest';
import { computeCharacterTier, classifyAllCharacters } from '../../src/services/character-tier.js';
import type { CharacterProfile } from '../../src/types.js';

describe('computeCharacterTier', () => {
  it('returns major for segmentCount >= 20', () => {
    expect(computeCharacterTier(20)).toBe('major');
    expect(computeCharacterTier(100)).toBe('major');
  });

  it('returns supporting for 5 <= segmentCount < 20', () => {
    expect(computeCharacterTier(5)).toBe('supporting');
    expect(computeCharacterTier(19)).toBe('supporting');
  });

  it('returns minor for segmentCount < 5', () => {
    expect(computeCharacterTier(0)).toBe('minor');
    expect(computeCharacterTier(4)).toBe('minor');
    expect(computeCharacterTier(1)).toBe('minor');
  });

  it('respects custom thresholds', () => {
    const thresholds = { majorMin: 10, supportingMin: 3 };
    expect(computeCharacterTier(10, thresholds)).toBe('major');
    expect(computeCharacterTier(9, thresholds)).toBe('supporting');
    expect(computeCharacterTier(3, thresholds)).toBe('supporting');
    expect(computeCharacterTier(2, thresholds)).toBe('minor');
  });

  it('handles edge case at boundaries', () => {
    expect(computeCharacterTier(5)).toBe('supporting');
    expect(computeCharacterTier(4)).toBe('minor');
    expect(computeCharacterTier(20)).toBe('major');
    expect(computeCharacterTier(19)).toBe('supporting');
  });
});

describe('classifyAllCharacters', () => {
  const makeProfile = (
    name: string,
    segmentCount: number,
  ): CharacterProfile => ({
    name,
    gender: 'male',
    ageGroup: 'adult',
    traits: [],
    segmentCount,
    tier: 'minor', // will be overwritten
  });

  it('classifies mixed tier characters correctly', () => {
    const characters = [
      makeProfile('主角', 50),
      makeProfile('配角', 10),
      makeProfile('路人', 2),
    ];

    const result = classifyAllCharacters(characters);
    expect(result[0]!.tier).toBe('major');
    expect(result[1]!.tier).toBe('supporting');
    expect(result[2]!.tier).toBe('minor');
  });

  it('always classifies narrator as major regardless of segment count', () => {
    const characters = [
      makeProfile('narrator', 1),
    ];

    const result = classifyAllCharacters(characters);
    expect(result[0]!.tier).toBe('major');
  });

  it('narrator stays major even with 0 segments', () => {
    const characters = [
      makeProfile('narrator', 0),
    ];

    const result = classifyAllCharacters(characters);
    expect(result[0]!.tier).toBe('major');
  });

  it('returns empty array for empty input', () => {
    expect(classifyAllCharacters([])).toEqual([]);
  });

  it('does not mutate original array', () => {
    const original = [makeProfile('张三', 25)];
    const originalTier = original[0]!.tier;
    classifyAllCharacters(original);
    expect(original[0]!.tier).toBe(originalTier);
  });

  it('respects custom thresholds', () => {
    const characters = [
      makeProfile('角色A', 8),
      makeProfile('角色B', 2),
    ];
    const result = classifyAllCharacters(characters, { majorMin: 10, supportingMin: 3 });
    expect(result[0]!.tier).toBe('supporting');
    expect(result[1]!.tier).toBe('minor');
  });
});
