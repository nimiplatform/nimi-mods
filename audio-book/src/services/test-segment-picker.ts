// ---------------------------------------------------------------------------
// Test segment picker — select 2-3 representative segments for test synthesis
// ---------------------------------------------------------------------------

import type { ScriptSegment, VoiceCasting } from '../types.js';

/** Max text length for test segments — avoids AI_INPUT_INVALID from long texts */
const MAX_TEST_TEXT_LENGTH = 500;

/**
 * Pick a small set of segments that covers different voices.
 *
 * Strategy:
 *  1. Group segments by their assigned voiceId (via castingMap speaker lookup)
 *  2. For each voice group, pick the best candidate:
 *     - Prefer non-fallback segments
 *     - Prefer shorter text (< MAX_TEST_TEXT_LENGTH) to avoid API limits
 *  3. Return at most `maxCount` segments
 */
export function pickTestSegments(
  segments: ScriptSegment[],
  castingMap: Map<string, VoiceCasting>,
  maxCount = 3,
): ScriptSegment[] {
  if (segments.length === 0) return [];

  // Group segments by voiceId — skip speakers with no casting (they'd fail TTS)
  const byVoice = new Map<string, ScriptSegment[]>();
  for (const seg of segments) {
    const casting = castingMap.get(seg.speaker);
    if (!casting) continue; // skip uncast speakers
    const key = casting.voiceId;
    const group = byVoice.get(key);
    if (group) {
      group.push(seg);
    } else {
      byVoice.set(key, [seg]);
    }
  }

  const picked: ScriptSegment[] = [];
  for (const [, group] of byVoice) {
    if (picked.length >= maxCount) break;
    const candidate = pickBestCandidate(group);
    if (candidate) picked.push(candidate);
  }

  return picked;
}

function pickBestCandidate(group: ScriptSegment[]): ScriptSegment | undefined {
  // Priority: non-fallback + short text > non-fallback + any text > fallback + short > fallback
  const nonFallback = group.filter((s) => !s.id.includes('-fallback-'));
  const source = nonFallback.length > 0 ? nonFallback : group;

  // Prefer segments with shorter text to avoid AI_INPUT_INVALID
  const short = source.filter((s) => s.text.length <= MAX_TEST_TEXT_LENGTH);
  if (short.length > 0) return short[0];

  // All segments are long — pick the shortest one
  const sorted = [...source].sort((a, b) => a.text.length - b.text.length);
  return sorted[0];
}
