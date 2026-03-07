import type { KismetCompatibilityInput, KismetCompatibilityResult, KismetLocalShareProfile } from '../types.js';
import { ELEMENT_LABELS, GENERATES } from './bazi/constants.js';
import { describeCompatibilityRelation } from './city-affinity.js';

function distributionDelta(left: KismetLocalShareProfile, right: KismetLocalShareProfile): number {
  const elements = ['metal', 'wood', 'water', 'fire', 'earth'] as const;
  return elements.reduce((sum, element) => (
    sum + Math.abs(left.canonicalProfile.fiveElementRatio[element] - right.canonicalProfile.fiveElementRatio[element])
  ), 0);
}

export function scoreCompatibility(selfProfile: KismetLocalShareProfile, targetProfile: KismetLocalShareProfile): KismetCompatibilityInput {
  const selfElement = selfProfile.canonicalProfile.dayMaster.element;
  const targetElement = targetProfile.canonicalProfile.dayMaster.element;
  let score = 58;

  if (selfElement === targetElement) {
    score += 12;
  }
  if (GENERATES[selfElement] === targetElement || GENERATES[targetElement] === selfElement) {
    score += 18;
  }
  if (selfProfile.canonicalProfile.favorableElements.includes(targetElement)) {
    score += 8;
  }
  if (targetProfile.canonicalProfile.favorableElements.includes(selfElement)) {
    score += 8;
  }
  if (selfProfile.canonicalProfile.unfavorableElements.includes(targetElement)) {
    score -= 10;
  }
  if (targetProfile.canonicalProfile.unfavorableElements.includes(selfElement)) {
    score -= 10;
  }

  score -= Math.round(distributionDelta(selfProfile, targetProfile) / 20);
  const finalScore = Math.max(0, Math.min(100, score));

  return {
    selfProfile,
    targetProfile,
    relationSummary: describeCompatibilityRelation(selfElement, targetElement),
    score: finalScore,
  };
}

export function buildCompatibilityFallback(input: KismetCompatibilityInput): KismetCompatibilityResult {
  const selfElement = input.selfProfile.canonicalProfile.dayMaster.element;
  const targetElement = input.targetProfile.canonicalProfile.dayMaster.element;
  return {
    overallScore: input.score,
    fiveElementRelation: input.relationSummary,
    complementaryAreas: [
      `${ELEMENT_LABELS[selfElement]}侧重节奏`,
      `${ELEMENT_LABELS[targetElement]}侧重回应`,
    ],
    tensionAreas: input.score < 60 ? ['边界感', '决策速度'] : [],
    summary: `${input.selfProfile.displayName} 与 ${input.targetProfile.displayName} 的五行关系为 ${input.relationSummary}。`,
    advice: input.score >= 70
      ? '适合先建立稳定协作与沟通节奏，再推进更深层互动。'
      : '建议先明确边界与期待，避免节奏错位放大矛盾。',
  };
}
