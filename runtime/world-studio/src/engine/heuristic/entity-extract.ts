import type {
  CharacterPoint,
  LocationPoint,
  TimelinePoint,
} from '../types.js';

function normalizeId(value: string, fallback: string): string {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || fallback;
}

export function toHeuristicTimeline(refs: string[]): TimelinePoint[] {
  return refs.map((ref, index) => ({
    id: `time-${index + 1}`,
    label: ref,
    description: 'Recovered from source text.',
    time: ref,
    weight: 0.4,
  }));
}

export function toHeuristicLocations(names: string[]): LocationPoint[] {
  return names.map((name, index) => ({
    id: normalizeId(name, `loc-${index + 1}`),
    name,
    description: 'Recovered from source text.',
    importance: 0.45,
  }));
}

export function toHeuristicCharacters(names: string[]): CharacterPoint[] {
  return names.map((name, index) => ({
    id: normalizeId(name, `char-${index + 1}`),
    name,
    summary: 'Recovered from source text (heuristic fallback).',
    significance: 0.2,
  }));
}
