// ---------------------------------------------------------------------------
// LLM prompts for script analysis (Step 2)
// ---------------------------------------------------------------------------

import type { CharacterProfile, ScriptSegment } from '../types.js';

const MAX_CONTEXT_CHARACTERS = 24;
const MAX_TRAITS_PER_CHARACTER = 3;
const MAX_RECENT_SEGMENT_PREVIEW_CHARS = 60;

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
    'You segment audiobook source text into TTS-ready script units and character records.',
    '',
    'Rules:',
    '- Cover the entire input exactly once. Do not skip, summarize, reorder, or translate.',
    '- Segment types: dialogue, narration, inner_thought, sound_effect.',
    '- narration speaker must be "narrator". dialogue and inner_thought speaker must be the proper character name.',
    '- Merge consecutive lines by the same speaker when they belong to one continuous utterance.',
    '- Put narrative text between dialogue into narration segments.',
    '- Use inner_thought for explicit internal monologue such as "他想" / "她心中暗道".',
    '- Target 20-500 characters per segment. Merge tiny fragments. Split very long text at natural sentence/dialogue boundaries.',
    '',
    'Chinese dialogue hints:',
    '- Dialogue is often enclosed in “…” or 「…」.',
    '- Patterns like “XX说 / XX问 / XX答 / XX喊道” indicate the speaker.',
    '- If attribution is omitted, infer speaker from nearby narration or turn-taking.',
    '- Group speech may use a collective speaker name.',
    '',
    'Character rules:',
    '- Extract characters who speak, are named, or clearly matter in this chapter.',
    '- Reuse established names from prior context when the same character reappears.',
    '- isNew is true only when the character is not already in prior context.',
    '- Do not include narrator as a character entry.',
    '- Keep traits short and concrete.',
    '',
    'Output rules:',
    '- Return exactly one JSON object and nothing else.',
    '- Do not use markdown fences.',
    '- The response must start with { and end with }.',
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
  const recentSpeakerNames = new Set(
    recentSegments
      .map((segment) => segment.speaker)
      .filter((speaker) => speaker && speaker !== 'narrator'),
  );
  const knownCharacters = [...existingCharacters]
    .filter((character) => character.name && character.name !== 'narrator')
    .sort((left, right) => {
      const recentDelta = Number(recentSpeakerNames.has(right.name)) - Number(recentSpeakerNames.has(left.name));
      if (recentDelta !== 0) return recentDelta;
      if (left.segmentCount !== right.segmentCount) return right.segmentCount - left.segmentCount;
      return left.name.localeCompare(right.name);
    });
  const visibleCharacters = knownCharacters.slice(0, MAX_CONTEXT_CHARACTERS);

  if (visibleCharacters.length > 0) {
    parts.push('## Known Characters');
    for (const ch of visibleCharacters) {
      const traits = ch.traits.slice(0, MAX_TRAITS_PER_CHARACTER).join(', ') || 'none';
      parts.push(`- ${ch.name} (${ch.gender}, ${ch.ageGroup}, segments:${ch.segmentCount}, traits:${traits})`);
    }
    if (knownCharacters.length > visibleCharacters.length) {
      parts.push(`- ${knownCharacters.length - visibleCharacters.length} minor characters omitted for brevity; keep established names if they reappear.`);
    }
  }

  if (recentSegments.length > 0) {
    parts.push('');
    parts.push('## Recent Segments');
    for (const seg of recentSegments) {
      const emotionSuffix = seg.emotion ? ` [${seg.emotion}]` : '';
      const preview = seg.text.length > MAX_RECENT_SEGMENT_PREVIEW_CHARS
        ? `${seg.text.slice(0, MAX_RECENT_SEGMENT_PREVIEW_CHARS)}...`
        : seg.text;
      parts.push(`- [${seg.type}] ${seg.speaker}: "${preview}"${emotionSuffix}`);
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
  parts.push('Process only the chapter_content above. Return the JSON object now.');

  return parts.join('\n');
}
