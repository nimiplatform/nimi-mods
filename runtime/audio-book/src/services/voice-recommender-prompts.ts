// ---------------------------------------------------------------------------
// LLM prompts for voice recommendation (Step 3)
// ---------------------------------------------------------------------------

import type { CharacterProfile } from '../types.js';

type VoiceOption = {
  providerId: string;
  voiceId: string;
  voiceName: string;
  gender?: string;
  language?: string;
};

export const VOICE_RECOMMEND_SCHEMA_LINES: string[] = [
  '{',
  '  "assignments": [',
  '    {',
  '      "characterName": "character name",',
  '      "voiceId": "selected voiceId from available list",',
  '      "providerId": "provider of selected voice",',
  '      "voiceName": "display name of selected voice",',
  '      "reason": "brief reason for this choice"',
  '    }',
  '  ]',
  '}',
];

/**
 * Build the prompt for batch voice recommendation.
 */
export function buildVoiceRecommendPrompt(
  characters: CharacterProfile[],
  availableVoices: VoiceOption[],
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = [
    'You are a professional voice casting director for Chinese audiobook production.',
    'Your job is to assign the best TTS voice to each character based on their personality, gender, age, and role.',
    '',
    '## Rules',
    '- You MUST only choose voices from the provided available voices list.',
    '- Do NOT invent voice IDs or names that are not in the list.',
    '- Match voice gender to character gender. NEVER assign a female voice to a male character or vice versa.',
    '- Match voice age feel to character age group (child voices for children, mature voices for elders).',
    '- Match voice personality to character traits (e.g., a bold character should get a strong voice, a gentle character a warm voice).',
    '- Try to ensure variety — avoid assigning the same voice to multiple major characters.',
    '- For narrator, pick a clear, authoritative voice suitable for narration (e.g., Neil/阿闻 for male narrator, Bellona/燕铮萱 for female).',
    '- Each major character MUST have a unique voice.',
    '',
    '## Output',
    'Return STRICT JSON only. No markdown, no commentary, no thinking.',
    'Schema:',
    ...VOICE_RECOMMEND_SCHEMA_LINES,
  ].join('\n');

  const voiceListText = availableVoices
    .map((v) => `- ${v.voiceId} (${v.voiceName}, provider: ${v.providerId}${v.gender ? `, gender: ${v.gender}` : ''}${v.language ? `, language: ${v.language}` : ''})`)
    .join('\n');

  const characterListText = characters
    .map((ch) => `- ${ch.name}: ${ch.gender}, ${ch.ageGroup}, ${ch.segmentCount} segments, tier: ${ch.tier}, traits: ${ch.traits.join(', ') || 'none'}`)
    .join('\n');

  const userPrompt = [
    '## Available Voices',
    voiceListText,
    '',
    '## Characters to Cast',
    characterListText,
    '',
    'Assign the best voice to each character and return the JSON result.',
  ].join('\n');

  return { systemPrompt, userPrompt };
}
