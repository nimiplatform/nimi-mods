import { asRecord } from '@nimiplatform/mod-sdk/utils';
import type {
  AccumulatedCharacter,
  AccumulatedEvent,
  AccumulatedLocation,
  AccumulatedRelation,
  AccumulatedState,
  AccumulatedTimeline,
} from './types.js';

export function createEmptyAccumulatedState(): AccumulatedState {
  return {
    worldSetting: '',
    timeline: [],
    locations: [],
    characters: [],
    events: { primary: [], secondary: [] },
    characterRelations: [],
    lastProcessedChunk: -1,
    successfulChunks: 0,
  };
}

/** Rough token estimate — CJK ~0.7 token/char, English ~1.3 token/word */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  let cjkChars = 0;
  let asciiChars = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0x4e00 && code <= 0x9fff) {
      cjkChars++;
    } else {
      asciiChars++;
    }
  }
  const cjkTokens = cjkChars * 0.7;
  const asciiTokens = asciiChars > 0
    ? text.replace(/[\u4e00-\u9fff]/g, '').split(/\s+/).filter(Boolean).length * 1.3
    : 0;
  return Math.ceil(cjkTokens + asciiTokens);
}

function truncate(value: string, maxChars: number): string {
  const text = String(value || '').trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

type SortableWithFreshness = { _freshness: { mentionCount: number; lastSeenChunk: number } };

function sortByFreshness<T extends SortableWithFreshness>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const mentionDiff = b._freshness.mentionCount - a._freshness.mentionCount;
    if (mentionDiff !== 0) return mentionDiff;
    return b._freshness.lastSeenChunk - a._freshness.lastSeenChunk;
  });
}

function buildCharacterLines(characters: AccumulatedCharacter[]): string[] {
  return sortByFreshness(characters).map((item) => {
    const record = asRecord(item);
    const name = String(record.name || '').trim();
    const summary = truncate(String(record.summary || record.description || ''), 60);
    const mentions = item._freshness.mentionCount;
    return `- ${name}${summary ? `: ${summary}` : ''} [mentions:${mentions}]`;
  });
}

function buildEventLines(events: AccumulatedEvent[]): string[] {
  return sortByFreshness(events).map((event) => {
    const summary = truncate(event.summary || '', 80);
    return `- [id=${event.id}] [${event.level}] ${event.title}${summary ? `: ${summary}` : ''}`;
  });
}

function buildLocationLines(locations: AccumulatedLocation[]): string[] {
  return sortByFreshness(locations).map((item) => {
    const record = asRecord(item);
    const name = String(record.name || '').trim();
    const description = truncate(String(record.description || ''), 40);
    return `- ${name}${description ? `: ${description}` : ''}`;
  });
}

function buildRelationLines(relations: AccumulatedRelation[]): string[] {
  return sortByFreshness(relations).map((item) => {
    const record = asRecord(item);
    const source = String(record.source || '').trim();
    const target = String(record.target || '').trim();
    const relation = String(record.relation || '').trim();
    return `- ${source} → ${target}${relation ? `: ${relation}` : ''}`;
  });
}

function buildTimelineLines(timeline: AccumulatedTimeline[]): string[] {
  return sortByFreshness(timeline).map((item) => {
    const record = asRecord(item);
    const label = String(record.label || record.id || '').trim();
    const description = truncate(String(record.description || ''), 40);
    return `- ${label}${description ? `: ${description}` : ''}`;
  });
}

/**
 * Compress accumulated state into structured text for prompt injection.
 * Fills sections in priority order, truncating when token budget is exceeded.
 */
export function compressAccumulatedState(state: AccumulatedState, tokenBudget: number): string {
  const sections: string[] = [];
  let usedTokens = 0;

  const tryAppend = (text: string): boolean => {
    const cost = estimateTokenCount(text);
    if (usedTokens + cost > tokenBudget) return false;
    sections.push(text);
    usedTokens += cost;
    return true;
  };

  const tryAppendLines = (header: string, lines: string[]): void => {
    if (lines.length === 0) return;
    if (!tryAppend(header)) return;
    for (const line of lines) {
      if (!tryAppend(line)) break;
    }
  };

  // Priority order: worldSetting → characters → primary events → locations → secondary events → relations → timeline
  if (state.worldSetting) {
    tryAppend(`WORLD_SETTING: ${truncate(state.worldSetting, 200)}`);
  }

  tryAppendLines(
    `KNOWN_CHARACTERS (${state.characters.length} total):`,
    buildCharacterLines(state.characters),
  );

  tryAppendLines(
    `KNOWN_EVENTS (${state.events.primary.length} primary, ${state.events.secondary.length} secondary):`,
    buildEventLines(state.events.primary),
  );

  tryAppendLines(
    `KNOWN_LOCATIONS (${state.locations.length} total):`,
    buildLocationLines(state.locations),
  );

  // Secondary events (lower priority)
  if (state.events.secondary.length > 0) {
    tryAppendLines(
      'KNOWN_SECONDARY_EVENTS:',
      buildEventLines(state.events.secondary),
    );
  }

  tryAppendLines(
    `KNOWN_RELATIONS (${state.characterRelations.length} total):`,
    buildRelationLines(state.characterRelations),
  );

  tryAppendLines(
    `KNOWN_TIMELINE (${state.timeline.length} total):`,
    buildTimelineLines(state.timeline),
  );

  return sections.join('\n');
}

/**
 * Calculate the token budget available for compressed context.
 * Formula: effectiveContext - systemPrompt(900) - chunkTokens(chunkSize*0.5) - outputReservation(3000)
 */
export function resolveContextTokenBudget(effectiveContextTokens: number, chunkSize: number): number {
  const systemPromptTokens = 900;
  const chunkTokens = Math.ceil(chunkSize * 0.5);
  const outputReservation = 3000;
  const available = effectiveContextTokens - systemPromptTokens - chunkTokens - outputReservation;
  return Math.max(500, Math.min(4000, available));
}
