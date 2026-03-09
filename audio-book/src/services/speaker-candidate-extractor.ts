import {
  SPEECH_VERBS,
  THOUGHT_VERBS,
  cleanSpeakerName,
} from './speaker-lexicon.js';

export type AttributionSource =
  | 'before_speech_verb'
  | 'after_speech_verb'
  | 'before_thought_verb'
  | 'before_colon'
  | 'before_context_verb'
  | 'recent_turn';

export type AttributionCandidate = {
  speaker: string;
  source: AttributionSource;
  baseScore: number;
  evidenceText: string;
};

const SPEAKER_TOKEN_PATTERN = '[\\u4e00-\\u9fffA-Za-z0-9]{1,12}';
const WINDOW_CHARS = 48;
const VERB_COMPLEMENT_PREFIX_RE = /^(?:完|了|着|过|起|起来|下|开|的)/u;
const CLAUSE_SPLIT_RE = /[。！？!?；;\n，,:：]/gu;
const SORTED_SPEECH_VERBS = [...SPEECH_VERBS].sort((left, right) => right.length - left.length);
const SORTED_THOUGHT_VERBS = [...THOUGHT_VERBS].sort((left, right) => right.length - left.length);
const LEADING_SPEAKER_TOKEN_RE = new RegExp(`^(${SPEAKER_TOKEN_PATTERN})`, 'u');

function buildCandidate(
  speaker: string,
  source: AttributionSource,
  baseScore: number,
  evidenceText: string,
): AttributionCandidate | null {
  const cleaned = cleanSpeakerName(speaker);
  if (!cleaned || cleaned === 'unknown') return null;
  return {
    speaker: cleaned,
    source,
    baseScore,
    evidenceText,
  };
}

function findTrailingSpeakerByVerb(beforeText: string, verbs: readonly string[]): string {
  const trimmed = beforeText.trimEnd().replace(/[：:，,]\s*$/u, '');
  for (const verb of verbs) {
    if (!trimmed.endsWith(verb)) continue;
    const rawSpeaker = takeNearestClause(trimmed.slice(0, -verb.length));
    const cleaned = cleanSpeakerName(rawSpeaker);
    if (cleaned && cleaned !== 'unknown') {
      return cleaned;
    }
  }
  return 'unknown';
}

function takeNearestClause(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';

  let lastBoundaryEnd = 0;
  for (const match of trimmed.matchAll(CLAUSE_SPLIT_RE)) {
    lastBoundaryEnd = match.index! + match[0].length;
  }

  return trimmed.slice(lastBoundaryEnd).trim();
}

function findSpeakerAfterVerbFirst(afterText: string, verbs: readonly string[]): string {
  const trimmed = afterText.trimStart();
  for (const verb of verbs) {
    if (!trimmed.startsWith(verb)) continue;
    const remainder = trimmed.slice(verb.length).trimStart();
    if (!remainder || VERB_COMPLEMENT_PREFIX_RE.test(remainder)) continue;
    const rawSpeaker = remainder.match(LEADING_SPEAKER_TOKEN_RE)?.[1] ?? '';
    const cleaned = cleanSpeakerName(rawSpeaker);
    if (cleaned && cleaned !== 'unknown') {
      return cleaned;
    }
  }
  return 'unknown';
}

function findLeadingSpeakerByVerb(afterText: string, verbs: readonly string[]): string {
  const trimmed = afterText.trimStart();
  let bestSpeaker = 'unknown';
  let bestVerbIndex = Number.POSITIVE_INFINITY;

  for (const verb of verbs) {
    const verbIndex = trimmed.indexOf(verb);
    if (verbIndex <= 0 || verbIndex > 12) continue;
    // Single-char verbs (道/说/问/答) must be followed by a delimiter — not part of words like 大逆不道
    if (verb.length === 1) {
      const nextChar = trimmed[verbIndex + 1] ?? '';
      if (nextChar && !/[，。！？；：、\s\n\u201c\u201d\u300c\u300d\u300e\u300f”]/u.test(nextChar)) continue;
    }
    const prefix = trimmed.slice(0, verbIndex);
    if (/[\u201c\u201d\u300c\u300d\u300e\u300f”]/u.test(prefix)) continue;
    const rawSpeaker = takeNearestClause(prefix);
    if (!rawSpeaker) continue;
    const cleaned = cleanSpeakerName(rawSpeaker);
    if (cleaned && cleaned !== 'unknown') {
      if (verbIndex < bestVerbIndex) {
        bestSpeaker = cleaned;
        bestVerbIndex = verbIndex;
      }
    }
  }

  return bestSpeaker;
}

/**
 * Detect `XXX：` or `XXX:` pattern right before a quote.
 * Colons directly before quotes are strong speaker indicators even without a speech verb.
 */
function findSpeakerBeforeColon(beforeText: string): string {
  const trimmed = beforeText.trimEnd();
  if (!trimmed.endsWith('：') && !trimmed.endsWith(':')) return 'unknown';
  const withoutColon = trimmed.slice(0, -1);
  const clause = takeNearestClause(withoutColon);
  // If the clause contains a speech verb, extract the speaker from before the verb
  // e.g. "一名男红卫兵质问叶哲泰" → cut at "质问" → "一名男红卫兵"
  for (const verb of SORTED_SPEECH_VERBS) {
    const idx = clause.indexOf(verb);
    if (idx > 0) {
      const beforeVerb = clause.slice(0, idx);
      const cleaned = cleanSpeakerName(beforeVerb);
      if (cleaned && cleaned !== 'unknown') return cleaned;
    }
  }
  const cleaned = cleanSpeakerName(clause);
  return cleaned && cleaned !== 'unknown' ? cleaned : 'unknown';
}

/**
 * Scan the before-text for a `speaker + verb` pattern NOT at the trailing position.
 * Handles cases like: "绍琳指着丈夫喝道，她显然不习惯…「quote」"
 * where the verb is in the middle of the before-text, followed by more narration.
 */
function findSpeakerInBeforeContext(beforeText: string, verbs: readonly string[]): string {
  const trimmed = beforeText.trimEnd().replace(/[：:，,]\s*$/u, '');

  let bestSpeaker = 'unknown';
  let bestVerbPos = -1;

  for (const verb of verbs) {
    if (trimmed.endsWith(verb)) continue; // handled by findTrailingSpeakerByVerb
    const idx = trimmed.lastIndexOf(verb);
    if (idx <= 0 || idx <= bestVerbPos) continue;
    // Single-char verbs (道/说/问/答) must be followed by a delimiter — not part of words like 大逆不道
    if (verb.length === 1) {
      const nextChar = trimmed[idx + 1] ?? '';
      if (nextChar && !/[，。！？；：、\s\n\u201c\u201d\u300c\u300d\u300e\u300f"]/u.test(nextChar)) continue;
    }
    // Ensure no quote marks between this verb and the end (would mean a different quote)
    const afterVerb = trimmed.slice(idx + verb.length);
    if (/[\u201c\u201d\u300c\u300d\u300e\u300f"]/u.test(afterVerb)) continue;
    // Skip if verb is immediately followed by a complement (着/了/过/etc.) — not a real attribution
    if (VERB_COMPLEMENT_PREFIX_RE.test(afterVerb)) continue;
    const prefix = trimmed.slice(0, idx);
    const rawSpeaker = takeNearestClause(prefix);
    const cleaned = cleanSpeakerName(rawSpeaker);
    if (cleaned && cleaned !== 'unknown') {
      bestSpeaker = cleaned;
      bestVerbPos = idx;
    }
  }

  return bestSpeaker;
}

export function extractSpeakerCandidates(input: {
  chapterText: string;
  quoteStart: number;
  quoteEnd: number;
  recentSpeakers: string[];
}): AttributionCandidate[] {
  const chapterText = String(input.chapterText || '');
  const beforeText = chapterText.slice(Math.max(0, input.quoteStart - WINDOW_CHARS), input.quoteStart);
  const afterText = chapterText.slice(input.quoteEnd, Math.min(chapterText.length, input.quoteEnd + WINDOW_CHARS));
  const candidates: AttributionCandidate[] = [];

  const beforeThoughtSpeaker = findTrailingSpeakerByVerb(beforeText, SORTED_THOUGHT_VERBS);
  if (beforeThoughtSpeaker !== 'unknown') {
    const candidate = buildCandidate(beforeThoughtSpeaker, 'before_thought_verb', 1.0, beforeText);
    if (candidate) candidates.push(candidate);
  }

  const beforeSpeechSpeaker = findTrailingSpeakerByVerb(beforeText, SORTED_SPEECH_VERBS);
  if (beforeSpeechSpeaker !== 'unknown') {
    const candidate = buildCandidate(beforeSpeechSpeaker, 'before_speech_verb', 0.95, beforeText);
    if (candidate) candidates.push(candidate);
  }

  // Colon-based attribution: "XXX：「quote」"
  const colonSpeaker = findSpeakerBeforeColon(beforeText);
  if (colonSpeaker !== 'unknown') {
    const candidate = buildCandidate(colonSpeaker, 'before_colon', 0.90, beforeText);
    if (candidate) candidates.push(candidate);
  }

  // Mid-context verb: "绍琳喝道，她显然不习惯…「quote」"
  const contextSpeaker = findSpeakerInBeforeContext(beforeText, SORTED_SPEECH_VERBS);
  if (contextSpeaker !== 'unknown') {
    const candidate = buildCandidate(contextSpeaker, 'before_context_verb', 0.85, beforeText);
    if (candidate) candidates.push(candidate);
  }

  const afterVerbFirstSpeaker = findSpeakerAfterVerbFirst(afterText, SORTED_SPEECH_VERBS);
  if (afterVerbFirstSpeaker !== 'unknown') {
    const candidate = buildCandidate(afterVerbFirstSpeaker, 'after_speech_verb', 0.9, afterText);
    if (candidate) candidates.push(candidate);
  }

  const afterNameFirstSpeaker = findLeadingSpeakerByVerb(afterText, SORTED_SPEECH_VERBS);
  if (afterNameFirstSpeaker !== 'unknown') {
    const candidate = buildCandidate(afterNameFirstSpeaker, 'after_speech_verb', 0.92, afterText);
    if (candidate) candidates.push(candidate);
  }

  const recentResolved = input.recentSpeakers.filter((speaker) => (
    speaker &&
    speaker !== 'unknown' &&
    speaker !== 'narrator'
  ));
  if (recentResolved.length >= 2) {
    const lastSpeaker = recentResolved[recentResolved.length - 1]!;
    const prevSpeaker = recentResolved[recentResolved.length - 2]!;
    const fallbackSpeaker = lastSpeaker !== prevSpeaker
      ? prevSpeaker
      : recentResolved.length >= 3
        ? recentResolved[recentResolved.length - 3]!
        : '';
    if (!fallbackSpeaker) return candidates;
    const candidate = buildCandidate(fallbackSpeaker, 'recent_turn', 0.65, '');
    if (candidate) candidates.push(candidate);
  }

  return candidates;
}
