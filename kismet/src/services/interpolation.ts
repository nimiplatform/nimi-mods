import type { AiKeyNode, ChartDataPoint } from '../types.js';

const TIAN_GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'] as const;
const DI_ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'] as const;

function yearToGanZhi(year: number): string {
  const ganIndex = ((year - 4) % 10 + 10) % 10;
  const zhiIndex = ((year - 4) % 12 + 12) % 12;
  return TIAN_GAN[ganIndex]! + DI_ZHI[zhiIndex]!;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Deterministic hash-based pseudo-random for reproducibility */
function seededRandom(seed: number): number {
  let x = Math.sin(seed * 9301 + 49297) * 233280;
  x = x - Math.floor(x);
  return x;
}

function findDaYun(age: number, nodes: AiKeyNode[]): string {
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (age >= nodes[i]!.age) return nodes[i]!.daYun;
  }
  return nodes[0]!.daYun;
}

function findTag(age: number, nodes: AiKeyNode[]): string {
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (age >= nodes[i]!.age) return nodes[i]!.tag;
  }
  return nodes[0]!.tag;
}

export function interpolateKeyNodes(keyNodes: AiKeyNode[], birthYear: number): ChartDataPoint[] {
  const sorted = [...keyNodes].sort((a, b) => a.age - b.age);
  const points: ChartDataPoint[] = [];

  for (let age = 1; age <= 100; age++) {
    const year = birthYear + age - 1;
    const ganZhi = yearToGanZhi(year);
    const daYun = findDaYun(age, sorted);
    const tag = findTag(age, sorted);

    // Find surrounding key nodes
    let prevNode = sorted[0]!;
    let nextNode = sorted[sorted.length - 1]!;
    for (let i = 0; i < sorted.length - 1; i++) {
      if (age >= sorted[i]!.age && age <= sorted[i + 1]!.age) {
        prevNode = sorted[i]!;
        nextNode = sorted[i + 1]!;
        break;
      }
    }

    // If exactly on a key node, use its values directly
    const exactNode = sorted.find((n) => n.age === age);
    if (exactNode) {
      points.push({
        age,
        year,
        ganZhi,
        daYun: exactNode.daYun,
        open: Math.round(exactNode.open),
        close: Math.round(exactNode.close),
        high: Math.round(exactNode.high),
        low: Math.round(exactNode.low),
        score: Math.round(exactNode.score),
        reason: exactNode.tag,
      });
      continue;
    }

    // Interpolation factor
    const span = nextNode.age - prevNode.age;
    const t = span > 0 ? (age - prevNode.age) / span : 0;

    // Base score from linear interpolation
    const baseScore = lerp(prevNode.score, nextNode.score, t);

    // Add deterministic noise for natural variation
    const noise = (seededRandom(age * 137 + birthYear) - 0.5) * 8;
    const score = clamp(Math.round(baseScore + noise), 0, 100);

    // Generate OHLC from score with variation
    const r1 = seededRandom(age * 251 + birthYear + 1);
    const r2 = seededRandom(age * 373 + birthYear + 2);
    const amplitude = clamp(Math.abs(nextNode.score - prevNode.score) * 0.15 + 3, 2, 12);

    const open = clamp(Math.round(score + (r1 - 0.5) * amplitude), 0, 100);
    const close = clamp(Math.round(score + (r2 - 0.5) * amplitude), 0, 100);
    const highBase = Math.max(open, close);
    const lowBase = Math.min(open, close);
    const high = clamp(Math.round(highBase + seededRandom(age * 491 + birthYear) * amplitude * 0.5), highBase, 100);
    const low = clamp(Math.round(lowBase - seededRandom(age * 617 + birthYear) * amplitude * 0.5), 0, lowBase);

    points.push({
      age,
      year,
      ganZhi,
      daYun,
      open,
      close,
      high,
      low,
      score,
      reason: tag,
    });
  }

  return points;
}
