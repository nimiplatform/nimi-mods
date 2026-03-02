// ---------------------------------------------------------------------------
// LLM prompts for script analysis (Step 2)
// ---------------------------------------------------------------------------

import type { CharacterProfile, ScriptSegment } from '../types.js';

/**
 * JSON schema embedded in the prompt for per-chapter analysis output.
 */
export const ANALYSIS_SCHEMA_LINES: string[] = [
  '{',
  '  "segments": [',
  '    {',
  '      "type": "dialogue | narration | inner_thought | sound_effect",',
  '      "speaker": "character name or narrator",',
  '      "text": "segment text content",',
  '      "emotion": "optional emotion label"',
  '    }',
  '  ],',
  '  "characters": [',
  '    {',
  '      "name": "character proper name",',
  '      "gender": "male | female | neutral",',
  '      "ageGroup": "child | young | adult | elder",',
  '      "traits": ["trait1", "trait2"],',
  '      "isNew": true',
  '    }',
  '  ]',
  '}',
];

/**
 * Build the system prompt for chapter analysis.
 */
export function buildAnalysisSystemPrompt(): string {
  return [
    'You are a script analysis engine for audiobook production.',
    'Your job is to split narrative text into segments for TTS synthesis and extract character profiles.',
    '',
    '## Segment Rules',
    '- Each segment is a minimal TTS synthesis unit.',
    '- Types: dialogue (character speech), narration (third-person narrative), inner_thought (internal monologue), sound_effect (described sounds).',
    '- "speaker" for narration segments must be "narrator".',
    '- "speaker" for dialogue/inner_thought must be the character\'s proper name as it appears in the text.',
    '- Consecutive dialogue by the same speaker should be merged into one segment.',
    '- Narrative text between dialogue becomes a narration segment.',
    '- Inner monologue (e.g. "他想…" / "她心中暗道" style) should be inner_thought type.',
    '- Ideal segment length: 20-500 characters. Merge if <20, split at natural breaks if >500.',
    '- Preserve the original language of the text. Never translate.',
    '- You MUST segment the ENTIRE chapter text. Do NOT skip or summarize any portion.',
    '',
    '## Chinese Text Conventions',
    '- Chinese dialogue is enclosed in \u201c\u201d (full-width quotation marks) or \u300c\u300d.',
    '- Attribution patterns: \u201cXX\u8bf4\u201d / \u201cXX\u8bf4\u9053\u201d / \u201cXX\u559d\u9053\u201d / \u201cXX\u558a\u9053\u201d / \u201cXX\u95ee\u201d / \u201cXX\u7b54\u201d etc. Identify XX as the speaker.',
    '- When attribution is implicit (no explicit \u201cXX\u8bf4\u201d), infer the speaker from context (surrounding narration, alternating turns).',
    '- Crowd speech (\u201c\u4f17\u4eba\u201d / \u201c\u4eba\u7fa4\u201d / collective shouts) can use a group name as speaker.',
    '',
    '## Character Rules',
    '- Extract ALL characters who speak, are addressed by name, or play a role in this chapter.',
    '- "isNew" should be true only for characters not present in the accumulated character list.',
    '- Use consistent naming \u2014 if a character was already identified, use their established name.',
    '- Do NOT include "narrator" as a character; narrator is a special system-level speaker.',
    '- Include character traits observed in this chapter (personality, role, relationship).',
    '',
    '## Output',
    'CRITICAL: Return ONLY the JSON object. No thinking, no reasoning, no analysis, no explanation.',
    'Do NOT wrap in markdown code fences. Do NOT prefix with any text.',
    'Your response must begin with the character { and end with }.',
    'You MUST produce a comprehensive segment list covering the ENTIRE chapter text.',
    'A typical chapter of 5000+ characters should produce 20-60 segments.',
    'Schema:',
    ...ANALYSIS_SCHEMA_LINES,
  ].join('\n');
}

/**
 * Build the accumulated context string from prior analysis results.
 */
export function buildAccumulatedContext(
  existingCharacters: CharacterProfile[],
  recentSegments: ScriptSegment[],
): string {
  const parts: string[] = [];

  if (existingCharacters.length > 0) {
    parts.push('## Known Characters');
    for (const ch of existingCharacters) {
      parts.push(`- ${ch.name} (${ch.gender}, ${ch.ageGroup}, segments: ${ch.segmentCount}, traits: ${ch.traits.join(', ') || 'none'})`);
    }
  }

  if (recentSegments.length > 0) {
    parts.push('');
    parts.push('## Recent Segments (last few from previous chapter)');
    for (const seg of recentSegments) {
      const emotionSuffix = seg.emotion ? ` [${seg.emotion}]` : '';
      parts.push(`- [${seg.type}] ${seg.speaker}: "${seg.text.slice(0, 100)}..."${emotionSuffix}`);
    }
  }

  return parts.join('\n');
}

/**
 * Build the user prompt for a single chapter.
 */
export function buildChapterAnalysisPrompt(input: {
  chapterText: string;
  chapterIndex: number;
  totalChapters: number;
  accumulatedContext: string;
}): string {
  const parts: string[] = [];

  if (input.accumulatedContext) {
    parts.push('## Context from Previous Chapters');
    parts.push(input.accumulatedContext);
    parts.push('');
  }

  parts.push(`## Chapter ${input.chapterIndex + 1}/${input.totalChapters} (${input.chapterText.length} characters)`);
  parts.push('<chapter_content>');
  parts.push(input.chapterText);
  parts.push('</chapter_content>');
  parts.push('');
  parts.push('Segment the ENTIRE chapter text above into TTS segments. Return the JSON object now.');

  return parts.join('\n');
}
