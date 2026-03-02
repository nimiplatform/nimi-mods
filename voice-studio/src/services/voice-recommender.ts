// ---------------------------------------------------------------------------
// Voice recommender — assigns TTS voices to characters
// ---------------------------------------------------------------------------

import type {
  CharacterProfile,
  Gender,
  LlmClient,
  TtsClient,
  VoiceCasting,
} from '../types.js';
import { parseJsonRecord, summarizeModelError, buildRepairPrompt } from './json-repair.js';
import { VOICE_RECOMMEND_SCHEMA_LINES, buildVoiceRecommendPrompt } from './voice-recommender-prompts.js';

// ---------------------------------------------------------------------------
// Default voice fallbacks by gender
// ---------------------------------------------------------------------------

const DEFAULT_VOICE_MAP: Record<Gender, { voiceId: string; voiceName: string }> = {
  male: { voiceId: 'Ethan', voiceName: '晨煦（阳光温暖朝气）' },
  female: { voiceId: 'Cherry', voiceName: '芊悦（阳光积极亲切自然）' },
  neutral: { voiceId: 'Neil', voiceName: '阿闻（字正腔圆专业主持）' },
};

/**
 * Assign a default voice based on gender.
 */
export function assignDefaultVoice(
  characterName: string,
  gender: Gender,
  defaultProviderId: string,
): VoiceCasting {
  const defaultVoice = DEFAULT_VOICE_MAP[gender];
  return {
    characterName,
    voiceSource: 'preset',
    providerId: defaultProviderId,
    voiceId: defaultVoice.voiceId,
    voiceName: defaultVoice.voiceName,
    speakingRate: 1.0,
    pitch: 0,
  };
}

// ---------------------------------------------------------------------------
// LLM-based voice recommendation
// ---------------------------------------------------------------------------

type VoiceAssignment = {
  characterName: string;
  voiceId: string;
  providerId: string;
  voiceName: string;
  reason: string;
};

function normalizeAssignments(raw: Record<string, unknown>): VoiceAssignment[] {
  const assignments = Array.isArray(raw.assignments) ? raw.assignments : [];
  return assignments
    .filter((a): a is Record<string, unknown> => a !== null && typeof a === 'object')
    .map((a) => ({
      characterName: String(a.characterName || '').trim(),
      voiceId: String(a.voiceId || '').trim(),
      providerId: String(a.providerId || '').trim(),
      voiceName: String(a.voiceName || '').trim(),
      reason: String(a.reason || '').trim(),
    }))
    .filter((a) => a.characterName && a.voiceId);
}

/**
 * Recommend voices for all major/supporting characters via LLM.
 * Minor characters get default voices by gender.
 */
export async function recommendAllVoices(
  llm: LlmClient,
  tts: TtsClient,
  characters: CharacterProfile[],
): Promise<VoiceCasting[]> {
  // Fetch available voices from TTS provider
  const availableVoices = await tts.listVoices();

  if (availableVoices.length === 0) {
    // No voices available — assign all defaults
    const defaultProvider = 'default';
    return characters.map((ch) => assignDefaultVoice(ch.name, ch.gender, defaultProvider));
  }

  const defaultProviderId = availableVoices[0]!.providerId;

  // Separate characters by tier
  const llmEligible = characters.filter((ch) => ch.tier === 'major' || ch.tier === 'supporting');
  const minorChars = characters.filter((ch) => ch.tier === 'minor');

  // Minor characters get default voices
  const minorCastings: VoiceCasting[] = minorChars.map((ch) =>
    assignDefaultVoice(ch.name, ch.gender, defaultProviderId),
  );

  if (llmEligible.length === 0) {
    return minorCastings;
  }

  // LLM recommendation for major/supporting with two-retry
  const { systemPrompt, userPrompt } = buildVoiceRecommendPrompt(llmEligible, availableVoices);

  let assignments: VoiceAssignment[] = [];
  const first = await llm.generateText({ routeHint: 'chat/default', systemPrompt, userPrompt });
  try {
    assignments = normalizeAssignments(parseJsonRecord(first.text));
  } catch (firstError) {
    const repairPrompt = buildRepairPrompt({
      schemaLines: VOICE_RECOMMEND_SCHEMA_LINES,
      sourceText: userPrompt,
      chapterIndex: 0,
      chapterTotal: 1,
      invalidOutput: first.text,
      parseError: summarizeModelError(firstError),
    });
    const second = await llm.generateText({
      routeHint: 'chat/retry-low-temp',
      systemPrompt: 'You are a JSON repair assistant. Return valid JSON only.',
      userPrompt: repairPrompt,
      temperature: 0.1,
    });
    try {
      assignments = normalizeAssignments(parseJsonRecord(second.text));
    } catch {
      // Fall through — unassigned characters will get defaults below
    }
  }

  // Build valid voiceId set for validation
  const validVoiceIds = new Set(availableVoices.map((v) => v.voiceId));

  // Convert assignments to castings, validate voice IDs
  const assignmentMap = new Map<string, VoiceAssignment>();
  for (const a of assignments) {
    if (validVoiceIds.has(a.voiceId)) {
      assignmentMap.set(a.characterName, a);
    }
  }

  const llmCastings: VoiceCasting[] = llmEligible.map((ch) => {
    const assignment = assignmentMap.get(ch.name);
    if (assignment) {
      return {
        characterName: ch.name,
        voiceSource: 'preset' as const,
        providerId: assignment.providerId,
        voiceId: assignment.voiceId,
        voiceName: assignment.voiceName,
        speakingRate: 1.0,
        pitch: 0,
      };
    }
    // Fallback to default if LLM didn't assign or assigned invalid voice
    return assignDefaultVoice(ch.name, ch.gender, defaultProviderId);
  });

  return [...llmCastings, ...minorCastings];
}
