import { EARTHLY_BRANCHES, HEAVENLY_STEMS, LUCK_COLORS, LUCK_DIRECTIONS } from './bazi/constants.js';
import type { ElementKey, KismetCanonicalProfile } from '../types.js';

function positiveMod(value: number, mod: number): number {
  return ((value % mod) + mod) % mod;
}

function buildGanzhi(index: number): string {
  return `${HEAVENLY_STEMS[positiveMod(index, 10)]}${EARTHLY_BRANCHES[positiveMod(index, 12)]}`;
}

function dayDiff(left: Date, right: Date): number {
  const leftUtc = Date.UTC(left.getFullYear(), left.getMonth(), left.getDate());
  const rightUtc = Date.UTC(right.getFullYear(), right.getMonth(), right.getDate());
  return Math.round((leftUtc - rightUtc) / 86_400_000);
}

export function resolveLocalDateString(timezone: string, referenceDate?: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(referenceDate || new Date());
}

export function deriveTodayGanzhi(date: string): string {
  const [year = 2000, month = 1, day = 1] = date.split('-').map((item) => Number(item));
  const reference = new Date(1984, 1, 2);
  const target = new Date(year, month - 1, day);
  return buildGanzhi(dayDiff(target, reference));
}

export function buildDailyDefaults(profile: KismetCanonicalProfile, timezone: string, referenceDate?: Date) {
  const date = resolveLocalDateString(timezone, referenceDate);
  const todayGanZhi = deriveTodayGanzhi(date);
  const primaryElement = profile.favorableElements[0]!;
  const secondaryElement = profile.favorableElements[1] || profile.dayMaster.element;
  const overallScore = Math.min(92, 60 + profile.fiveElementRatio[primaryElement] / 3);

  return {
    date,
    timezone,
    todayGanZhi,
    overallScore: Math.round(overallScore),
    careerScore: Math.round(Math.min(95, overallScore + 4)),
    relationshipScore: Math.round(Math.min(95, overallScore + 2)),
    wealthScore: Math.round(Math.max(40, overallScore - 3)),
    healthScore: Math.round(Math.max(45, overallScore - 1)),
    luckyElements: [primaryElement, secondaryElement] as ElementKey[],
    luckyDirections: [LUCK_DIRECTIONS[primaryElement][0] || '中宫', LUCK_DIRECTIONS[secondaryElement][0] || '中宫'],
    luckyColors: [LUCK_COLORS[primaryElement][0] || '白色', LUCK_COLORS[secondaryElement][0] || '白色'],
    luckyNumbers: [((profile.fiveElementRatio[primaryElement] % 9) || 9), ((profile.fiveElementRatio[secondaryElement] % 9) || 9)],
  };
}
