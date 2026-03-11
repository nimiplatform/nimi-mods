const DAY_MS = 86_400_000;
const TROPICAL_YEAR_DAYS = 365.242189;
const AVERAGE_SOLAR_DEGREES_PER_DAY = 360 / TROPICAL_YEAR_DAYS;

type SolarTermRule = {
  month: number;
  day20: number;
  day21: number;
  longitude: number;
  carriesToNextYear?: boolean;
};

const MAJOR_SOLAR_TERM_RULES: SolarTermRule[] = [
  { month: 2, day20: 4, day21: 3, longitude: 315 },  // 立春
  { month: 3, day20: 6, day21: 5, longitude: 345 },  // 惊蛰
  { month: 4, day20: 5, day21: 4, longitude: 15 },   // 清明
  { month: 5, day20: 6, day21: 5, longitude: 45 },   // 立夏
  { month: 6, day20: 6, day21: 5, longitude: 75 },   // 芒种
  { month: 7, day20: 7, day21: 7, longitude: 105 },  // 小暑
  { month: 8, day20: 8, day21: 7, longitude: 135 },  // 立秋
  { month: 9, day20: 8, day21: 7, longitude: 165 },  // 白露
  { month: 10, day20: 8, day21: 8, longitude: 195 }, // 寒露
  { month: 11, day20: 8, day21: 7, longitude: 225 }, // 立冬
  { month: 12, day20: 7, day21: 7, longitude: 255 }, // 大雪
  { month: 1, day20: 6, day21: 5, longitude: 285, carriesToNextYear: true }, // 小寒
];

const TERM_CACHE = new Map<string, Date>();

function degreesToRadians(value: number): number {
  return value * Math.PI / 180;
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function signedAngleDifference(target: number, current: number): number {
  const normalized = normalizeDegrees(target - current + 180) - 180;
  return normalized === -180 ? 180 : normalized;
}

function resolveSolarLongitude(date: Date): number {
  const julianDay = date.getTime() / DAY_MS + 2_440_587.5;
  const julianCentury = (julianDay - 2_451_545.0) / 36_525;

  const geometricMeanLongitude = normalizeDegrees(
    280.46646 + (36_000.76983 * julianCentury) + (0.0003032 * julianCentury * julianCentury),
  );
  const meanAnomaly = normalizeDegrees(
    357.52911 + (35_999.05029 * julianCentury) - (0.0001537 * julianCentury * julianCentury),
  );
  const meanAnomalyRadians = degreesToRadians(meanAnomaly);
  const equationOfCenter =
    Math.sin(meanAnomalyRadians) * (1.914602 - (0.004817 * julianCentury) - (0.000014 * julianCentury * julianCentury))
    + Math.sin(meanAnomalyRadians * 2) * (0.019993 - (0.000101 * julianCentury))
    + Math.sin(meanAnomalyRadians * 3) * 0.000289;

  const trueLongitude = geometricMeanLongitude + equationOfCenter;
  const omega = 125.04 - (1_934.136 * julianCentury);
  return normalizeDegrees(trueLongitude - 0.00569 - (0.00478 * Math.sin(degreesToRadians(omega))));
}

function resolveSeedTimestamp(year: number, termIndex: number): number {
  const rule = MAJOR_SOLAR_TERM_RULES[termIndex]!;
  const actualYear = rule.carriesToNextYear ? year + 1 : year;
  const roughDay = actualYear >= 2000 ? rule.day21 : rule.day20;
  return Date.UTC(actualYear, rule.month - 1, roughDay, 12, 0, 0);
}

function resolveMajorSolarTermInstantInternal(year: number, termIndex: number): Date {
  const key = `${year}:${termIndex}`;
  const cached = TERM_CACHE.get(key);
  if (cached) {
    return cached;
  }

  const targetLongitude = MAJOR_SOLAR_TERM_RULES[termIndex]!.longitude;
  let estimate = resolveSeedTimestamp(year, termIndex);

  for (let index = 0; index < 8; index += 1) {
    const diff = signedAngleDifference(targetLongitude, resolveSolarLongitude(new Date(estimate)));
    estimate += (diff / AVERAGE_SOLAR_DEGREES_PER_DAY) * DAY_MS;
  }

  let left = estimate - (2 * DAY_MS);
  let right = estimate + (2 * DAY_MS);
  let leftDiff = signedAngleDifference(targetLongitude, resolveSolarLongitude(new Date(left)));
  let rightDiff = signedAngleDifference(targetLongitude, resolveSolarLongitude(new Date(right)));

  while (leftDiff <= 0) {
    left -= DAY_MS;
    leftDiff = signedAngleDifference(targetLongitude, resolveSolarLongitude(new Date(left)));
  }
  while (rightDiff > 0) {
    right += DAY_MS;
    rightDiff = signedAngleDifference(targetLongitude, resolveSolarLongitude(new Date(right)));
  }

  for (let index = 0; index < 48; index += 1) {
    const midpoint = (left + right) / 2;
    const midpointDiff = signedAngleDifference(targetLongitude, resolveSolarLongitude(new Date(midpoint)));
    if (Math.abs(midpointDiff) < 1e-7 || (right - left) < 1_000) {
      const resolved = new Date(midpoint);
      TERM_CACHE.set(key, resolved);
      return resolved;
    }

    if (midpointDiff > 0) {
      left = midpoint;
    } else {
      right = midpoint;
    }
  }

  const resolved = new Date((left + right) / 2);
  TERM_CACHE.set(key, resolved);
  return resolved;
}

function resolveGanzhiYearBoundaries(year: number): Date[] {
  return MAJOR_SOLAR_TERM_RULES.map((_, index) => resolveMajorSolarTermInstantInternal(year, index));
}

export function resolveStartOfSpring(year: number): Date {
  return resolveMajorSolarTermInstantInternal(year, 0);
}

export function resolveSolarMonthIndex(birthInstant: Date, birthLocalYear: number): number {
  const ganzhiYear = birthInstant < resolveStartOfSpring(birthLocalYear) ? birthLocalYear - 1 : birthLocalYear;
  const boundaries = resolveGanzhiYearBoundaries(ganzhiYear);

  for (let index = boundaries.length - 1; index >= 0; index -= 1) {
    if (birthInstant >= boundaries[index]!) {
      return index;
    }
  }

  return 11;
}

export function resolveDaysToAdjacentSolarTerm(
  birthInstant: Date,
  birthLocalYear: number,
  direction: 1 | -1,
): number {
  const candidates = [-1, 0, 1]
    .flatMap((offset) => resolveGanzhiYearBoundaries(birthLocalYear + offset))
    .sort((left, right) => left.getTime() - right.getTime());

  if (direction > 0) {
    const next = candidates.find((term) => term > birthInstant) ?? candidates[candidates.length - 1]!;
    return Math.max(0, (next.getTime() - birthInstant.getTime()) / DAY_MS);
  }

  const previous = [...candidates].reverse().find((term) => term < birthInstant) ?? candidates[0]!;
  return Math.max(0, (birthInstant.getTime() - previous.getTime()) / DAY_MS);
}
