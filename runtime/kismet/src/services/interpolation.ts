import type { ChartDataPoint, KismetAiKeyNode } from '../types.js';

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

function lerp(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}

function seededRandom(seed: number): number {
  let value = Math.sin(seed * 9301 + 49297) * 233280;
  value -= Math.floor(value);
  return value;
}

function findActiveNode(age: number, nodes: KismetAiKeyNode[]): KismetAiKeyNode {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    if (age >= nodes[index]!.age) {
      return nodes[index]!;
    }
  }
  return nodes[0]!;
}

export function interpolateKeyNodes(keyNodes: KismetAiKeyNode[], birthYear: number): ChartDataPoint[] {
  const sorted = [...keyNodes].sort((left, right) => left.age - right.age);
  const points: ChartDataPoint[] = [];

  for (let age = 1; age <= 100; age += 1) {
    const year = birthYear + age - 1;
    const activeNode = findActiveNode(age, sorted);
    const exactNode = sorted.find((node) => node.age === age);
    if (exactNode) {
      points.push({
        age,
        year,
        ganZhi: yearToGanZhi(year),
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

    let previousNode = sorted[0]!;
    let nextNode = sorted[sorted.length - 1]!;
    for (let index = 0; index < sorted.length - 1; index += 1) {
      if (age >= sorted[index]!.age && age <= sorted[index + 1]!.age) {
        previousNode = sorted[index]!;
        nextNode = sorted[index + 1]!;
        break;
      }
    }

    const span = Math.max(1, nextNode.age - previousNode.age);
    const amount = (age - previousNode.age) / span;
    const baseScore = lerp(previousNode.score, nextNode.score, amount);
    const noise = (seededRandom(age * 137 + birthYear) - 0.5) * 8;
    const score = clamp(Math.round(baseScore + noise), 0, 100);
    const amplitude = clamp(Math.abs(nextNode.score - previousNode.score) * 0.15 + 3, 2, 12);
    const open = clamp(Math.round(score + (seededRandom(age * 251 + birthYear) - 0.5) * amplitude), 0, 100);
    const close = clamp(Math.round(score + (seededRandom(age * 373 + birthYear) - 0.5) * amplitude), 0, 100);
    const highBase = Math.max(open, close);
    const lowBase = Math.min(open, close);

    points.push({
      age,
      year,
      ganZhi: yearToGanZhi(year),
      daYun: activeNode.daYun,
      open,
      close,
      high: clamp(Math.round(highBase + seededRandom(age * 491 + birthYear) * amplitude * 0.5), highBase, 100),
      low: clamp(Math.round(lowBase - seededRandom(age * 617 + birthYear) * amplitude * 0.5), 0, lowBase),
      score,
      reason: activeNode.tag,
    });
  }

  return points;
}
