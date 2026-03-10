import type { ModRuntimeClient } from '@nimiplatform/sdk/mod/runtime';
import type { RuntimeRouteBinding } from '@nimiplatform/sdk/mod/runtime-route';
import {
  MINTYOU_REASON,
  type MbtiValue,
} from '../contracts.js';
import { DnaSynthesisOutputSchema } from '../schemas.js';
import type {
  BasicInfo,
  TraitExtractionResult,
  DnaSynthesisOutput,
  MintYouResult,
} from '../types.js';
import { emitMintYouLog } from '../logging.js';
import { mintYouMessage } from '../i18n/messages.js';

function buildSystemPrompt(): string {
  return `You are a persona synthesis engine for a social AI platform. Given a user's personality profile (primary archetype, secondary traits, relationship mode, formality, sentiment) along with their basic info and interests, generate a complete social persona.

Output a single JSON object with exactly these fields:

{
  "concept": "A one-paragraph persona summary capturing the character's essence",
  "description": "A bio paragraph describing who this persona is and how they interact",
  "greeting": "An opening message this persona would send when meeting someone new (in character)",
  "exampleDialogue": "A sample conversation exchange showing this persona's communication style (3-4 turns)",
  "systemPromptBase": "Core system prompt that defines this persona's identity and behavioral rules",
  "rules": ["Rule line 1", "Rule line 2", "..."],
  "scenario": "The default interaction context for this persona",
  "identity": {
    "role": "A short role description (e.g. 'gentle listener', 'witty challenger')",
    "worldview": "How this persona sees the world in 1-2 sentences",
    "summary": "A natural-language personality summary paragraph"
  },
  "personality": {
    "summary": "A natural-language description of the persona's personality",
    "mbti": "A 4-letter MBTI type (e.g. 'ENFP', 'ISTJ') inferred from the trait profile"
  },
  "communication": {
    "summary": "A description of how this persona communicates",
    "responseLength": "short|medium|long based on personality"
  }
}

Rules:
- All text fields must be non-empty strings.
- The greeting must reflect the persona's communication style (formality + sentiment).
- The MBTI must be a valid 4-letter code: [E|I][N|S][T|F][J|P].
- When Self Reported MBTI is provided, you MUST set personality.mbti to that exact value.
- The "rules" field must be an array of rule line strings.
- Output ONLY the JSON object. No markdown, no explanation.`;
}

function buildUserPrompt(input: {
  basicInfo: BasicInfo;
  traitResult: TraitExtractionResult;
  interests: string[];
  selfReportedMbti?: MbtiValue | null;
  currentFocus?: string;
}): string {
  const {
    basicInfo,
    traitResult,
    interests,
    selfReportedMbti,
    currentFocus,
  } = input;
  return `Generate a social persona with the following profile:

Display Name: ${basicInfo.displayName}
Gender: ${basicInfo.gender}
Age Range: ${basicInfo.ageRange}
Social Intent: ${basicInfo.socialIntent}

Primary Archetype: ${traitResult.dnaPrimary}
Secondary Traits: ${traitResult.dnaSecondary.join(', ')}
Relationship Mode: ${traitResult.relationshipMode}
Formality: ${traitResult.formality}
Sentiment: ${traitResult.sentiment}

Interests: ${interests.join(', ')}
Self Reported MBTI: ${selfReportedMbti || 'not provided'}
Current Focus Topic: ${currentFocus?.trim() || 'not provided'}

Generate the complete persona JSON now.`;
}

function parseJsonFromText(text: string): Record<string, unknown> {
  const trimmed = String(text || '').trim();
  if (!trimmed) throw new Error('Empty text');

  // Try markdown code block
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  const jsonText = codeBlockMatch ? codeBlockMatch[1]!.trim() : trimmed;

  const parsed = JSON.parse(jsonText);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Parsed value is not an object');
  }
  return parsed as Record<string, unknown>;
}

export async function synthesizeDna(input: {
  runtimeClient: ModRuntimeClient;
  basicInfo: BasicInfo;
  traitResult: TraitExtractionResult;
  interests: string[];
  selfReportedMbti?: MbtiValue | null;
  currentFocus?: string;
  binding?: RuntimeRouteBinding | null;
}): Promise<MintYouResult<DnaSynthesisOutput>> {
  const {
    runtimeClient,
    basicInfo,
    traitResult,
    interests,
    selfReportedMbti,
    currentFocus,
    binding,
  } = input;

  const systemPrompt = buildSystemPrompt();
  const prompt = buildUserPrompt({
    basicInfo,
    traitResult,
    interests,
    selfReportedMbti,
    currentFocus,
  });
  const actionHint = mintYouMessage(
    'Errors.dnaActionHint',
    'Check LLM route availability and retry synthesis.',
  );

  try {
    const result = await runtimeClient.ai.text.generate({
      input: prompt,
      system: systemPrompt,
      maxTokens: 4096,
      temperature: 0.7,
      binding: binding || undefined,
    });

    const raw = parseJsonFromText(result.text);

    // Normalize rules: LLM returns string[], we need to validate that
    const validation = DnaSynthesisOutputSchema.safeParse(raw);
    if (!validation.success) {
      const issues = validation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
      emitMintYouLog({
        level: 'warn',
        message: 'action:dna-synthesis:validate-failed',
        source: 'synthesizeDna',
        details: { issues },
      });
      return {
        ok: false,
        error: {
          reasonCode: MINTYOU_REASON.DNA_SYNTHESIS_FAILED,
          message: mintYouMessage(
            'Errors.dnaSchemaInvalid',
            'LLM output schema validation failed: {{issues}}',
            { issues },
          ),
          actionHint,
        },
      };
    }

    return { ok: true, data: validation.data as DnaSynthesisOutput };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error || '');
    const normalized = msg.trim() || 'unknown error';
    const lower = normalized.toLowerCase();
    const timeoutLike = (
      lower.includes('timeout')
      || lower.includes('timed out')
      || lower.includes('deadline_exceeded')
      || lower.includes('deadline exceeded')
      || lower.includes('ai_provider_timeout')
    );
    emitMintYouLog({
      level: 'error',
      message: 'action:dna-synthesis:error',
      source: 'synthesizeDna',
      details: { error: normalized, timeoutLike },
    });
    return {
      ok: false,
      error: {
        reasonCode: MINTYOU_REASON.DNA_SYNTHESIS_FAILED,
        message: timeoutLike
          ? mintYouMessage(
            'Errors.dnaSynthesisTimeout',
            'DNA synthesis timed out. Please retry or switch model.',
          )
          : mintYouMessage(
            'Errors.dnaSynthesisFailed',
            'DNA synthesis failed: {{detail}}',
            { detail: normalized },
          ),
        actionHint,
      },
    };
  }
}
