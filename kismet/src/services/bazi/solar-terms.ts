type SolarTermRule = {
  month: number;
  day20: number;
  day21: number;
};

const START_TERM_RULES: SolarTermRule[] = [
  { month: 2, day20: 4, day21: 3 },  // 立春
  { month: 3, day20: 6, day21: 5 },  // 惊蛰
  { month: 4, day20: 5, day21: 4 },  // 清明
  { month: 5, day20: 6, day21: 5 },  // 立夏
  { month: 6, day20: 6, day21: 5 },  // 芒种
  { month: 7, day20: 7, day21: 7 },  // 小暑
  { month: 8, day20: 8, day21: 7 },  // 立秋
  { month: 9, day20: 8, day21: 7 },  // 白露
  { month: 10, day20: 8, day21: 8 }, // 寒露
  { month: 11, day20: 8, day21: 7 }, // 立冬
  { month: 12, day20: 7, day21: 7 }, // 大雪
  { month: 1, day20: 6, day21: 5 },  // 小寒
];

function toDateOnly(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

export function resolveStartOfSpring(year: number): Date {
  const day = year >= 2000 ? 4 : 5;
  return new Date(year, 1, day);
}

export function resolveSolarMonthIndex(date: Date): number {
  const normalized = toDateOnly(date);
  const year = normalized.getFullYear();
  const centuryRule = year >= 2000 ? 'day21' : 'day20';
  const boundaries = START_TERM_RULES.map((rule) => {
    const actualYear = rule.month === 1 ? year + 1 : year;
    return new Date(actualYear, rule.month - 1, rule[centuryRule]);
  });

  const liChun = boundaries[0]!;
  if (normalized < liChun) {
    return 11;
  }

  for (let index = 1; index < boundaries.length; index += 1) {
    if (normalized < boundaries[index]!) {
      return index - 1;
    }
  }
  return 11;
}

export function resolveDaysToNextSolarTerm(date: Date): number {
  const normalized = toDateOnly(date);
  const year = normalized.getFullYear();
  const centuryRule = year >= 2000 ? 'day21' : 'day20';
  const boundaries = START_TERM_RULES.map((rule) => {
    const actualYear = rule.month === 1 ? year + 1 : year;
    return new Date(actualYear, rule.month - 1, rule[centuryRule]);
  });

  const nextBoundary = boundaries.find((item) => item > normalized) || boundaries[boundaries.length - 1]!;
  return Math.max(1, Math.ceil((nextBoundary.getTime() - normalized.getTime()) / 86_400_000));
}
