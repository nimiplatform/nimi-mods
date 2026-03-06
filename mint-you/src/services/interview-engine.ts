import type { ModRuntimeClient } from '@nimiplatform/sdk/mod/runtime';
import type { RuntimeRouteBinding } from '@nimiplatform/sdk/mod/runtime-route';
import { z } from 'zod';
import {
  PRIMARY_ARCHETYPES,
  SECONDARY_TRAITS,
  RELATIONSHIP_MODES,
  FORMALITY_VALUES,
  SENTIMENT_VALUES,
  MINTYOU_REASON,
} from '../contracts.js';
import { InterviewTurnOutputSchema } from '../schemas.js';
import type {
  InterviewMessage,
  InterviewTurnSignal,
  InterviewTurnOutput,
  InterviewStatus,
  MintYouResult,
} from '../types.js';
import { emitMintYouLog } from '../logging.js';
import { createUlid } from '../utils/ulid.js';

// ── Trait signal whitelist ──

const VALID_SIGNAL_KEYS = new Set<string>();
for (const k of PRIMARY_ARCHETYPES) VALID_SIGNAL_KEYS.add(`primary.${k}`);
for (const k of SECONDARY_TRAITS) VALID_SIGNAL_KEYS.add(`secondary.${k}`);
for (const k of RELATIONSHIP_MODES) VALID_SIGNAL_KEYS.add(`relationship.${k}`);
for (const k of FORMALITY_VALUES) VALID_SIGNAL_KEYS.add(`communication.formality.${k}`);
for (const k of SENTIMENT_VALUES) VALID_SIGNAL_KEYS.add(`communication.sentiment.${k}`);

const VALID_WEIGHTS = new Set([-2, -1, 1, 2]);

const MAX_CONTEXT_MESSAGES = 12;
const MAX_TURNS = 12;
const MIN_VALID_TURNS = 7;
const SOFT_MAX_TURNS = 10;
const MAX_TURN_ATTEMPTS = 3;

// ── Coverage helpers ──

type CoverageGroup = 'primary' | 'secondary' | 'relationship' | 'formality' | 'sentiment';

function computeCoverage(signals: InterviewTurnSignal[]): Set<CoverageGroup> {
  const covered = new Set<CoverageGroup>();
  for (const s of signals) {
    const parts = s.key.split('.');
    if (parts[0] === 'primary') covered.add('primary');
    else if (parts[0] === 'secondary') covered.add('secondary');
    else if (parts[0] === 'relationship') covered.add('relationship');
    else if (parts[0] === 'communication' && parts[1] === 'formality') covered.add('formality');
    else if (parts[0] === 'communication' && parts[1] === 'sentiment') covered.add('sentiment');
  }
  return covered;
}

function buildCoverageNote(covered: Set<CoverageGroup>): string {
  const uncovered: string[] = [];
  if (!covered.has('primary')) uncovered.push('their core personality archetype');
  if (!covered.has('relationship')) uncovered.push('how they connect with people');
  if (!covered.has('formality')) uncovered.push('their communication style');
  if (!covered.has('sentiment')) uncovered.push('their general outlook on life');
  if (!covered.has('secondary')) uncovered.push('their secondary personality quirks');

  if (uncovered.length === 0) return '';
  return `COVERAGE NOTE: Within the user's current topic, your follow-up angle can gently lean towards: [${uncovered.join(' / ')}]. But only do this when it feels natural. Never force a topic change for information gathering.`;
}

// ── Phase ──

function resolvePhase(turnCount: number): 'opening' | 'exploring' | 'deepening' | 'wrapping' {
  if (turnCount === 0) return 'opening';
  if (turnCount <= 3) return 'exploring';
  if (turnCount <= 6) return 'deepening';
  return 'wrapping';
}

function buildPhaseGuidance(turnCount: number, validTurnCount: number): string {
  const phase = resolvePhase(turnCount);
  switch (phase) {
    case 'opening':
      return 'PHASE: Opening. Start a conversation based on the user\'s interest tags. Ask an open-ended question.';
    case 'exploring':
      return 'PHASE: Exploring. Stay open and exploratory. Follow the user\'s energy and interests.';
    case 'deepening':
      return 'PHASE: Deepening. Go deeper into the current topic. Your follow-up angles can lean towards uncovered dimensions.';
    case 'wrapping':
      if (turnCount >= SOFT_MAX_TURNS && validTurnCount >= MIN_VALID_TURNS) {
        return 'PHASE: Wrapping (MUST end). You must naturally wrap up the conversation in your reply. Set suggestedEnd=true.';
      }
      if (validTurnCount >= MIN_VALID_TURNS) {
        return 'PHASE: Wrapping. You can naturally wrap up when it feels right. Set suggestedEnd=true when ready.';
      }
      if (turnCount >= SOFT_MAX_TURNS) {
        return 'PHASE: Wrapping (extended). We still need more substantive responses. Encourage the user to share more meaningfully.';
      }
      return 'PHASE: Wrapping. Continue the conversation — we still need a few more meaningful exchanges.';
  }
}

// ── System prompt ──

function buildSystemPrompt(input: {
  interests: string[];
  signals: InterviewTurnSignal[];
  turnCount: number;
  validTurnCount: number;
  language: string;
}): string {
  const { interests, signals, turnCount, validTurnCount, language } = input;

  const coverageNote = buildCoverageNote(computeCoverage(signals));
  const phaseGuidance = buildPhaseGuidance(turnCount, validTurnCount);

  const langInstruction = language.startsWith('zh')
    ? 'Respond to the user in Chinese (中文). All trait signal keys must remain in English.'
    : 'Respond to the user in English. All trait signal keys must remain in English.';

  return `You are a friendly, empathetic interviewer getting to know someone through natural conversation. Your goal is to understand their personality through their stories, opinions, and reactions — not through direct personality questions.

USER INTERESTS: ${interests.join(', ')}

${coverageNote}

${phaseGuidance}

HARD RULES:
1. First acknowledge what the user said — show you're listening — then ask your next question.
2. Ask at most ONE question per message.
3. Never ask meta-questions like "what kind of personality do you think you have?"
4. Do not change topics by default; only transition when the current topic is exhausted.
5. Transitions must connect to something the user already mentioned. Never introduce topics from nowhere.
6. Only set suggestedEnd=true when validTurnCount >= ${MIN_VALID_TURNS}.
7. When validTurnCount >= ${MIN_VALID_TURNS} and turnCount >= ${SOFT_MAX_TURNS}, you must wrap up naturally in your reply.
8. Keep assistantReply concise (within 220 Chinese characters or 500 English characters).

${langInstruction}

OUTPUT FORMAT: You must respond with a JSON object matching this exact schema:
{
  "assistantReply": "Your natural conversational reply to the user",
  "traitSignals": [
    { "key": "primary.CARING", "weight": 2, "evidence": "brief reason" }
  ],
  "turnControl": {
    "suggestedEnd": false,
    "phase": "opening|exploring|deepening|wrapping",
    "nextQuestionFocus": "internal note about what to explore next"
  },
  "memoryDigest": "Compressed summary of conversation key points so far"
}

VALID SIGNAL KEYS (use ONLY these):
Primary: ${PRIMARY_ARCHETYPES.map(k => `primary.${k}`).join(', ')}
Secondary: ${SECONDARY_TRAITS.map(k => `secondary.${k}`).join(', ')}
Relationship: ${RELATIONSHIP_MODES.map(k => `relationship.${k}`).join(', ')}
Formality: ${FORMALITY_VALUES.map(k => `communication.formality.${k}`).join(', ')}
Sentiment: ${SENTIMENT_VALUES.map(k => `communication.sentiment.${k}`).join(', ')}

VALID WEIGHTS: -2 (strong negative), -1 (weak negative), 1 (weak positive), 2 (strong positive)
Each evidence field must be ≤ 100 characters.
Maximum 8 signals per turn.`;
}

// ── User prompt ──

function buildUserPrompt(input: {
  messages: InterviewMessage[];
  memoryDigest: string;
}): string {
  const { messages, memoryDigest } = input;

  // Take the most recent N messages for context
  const recentMessages = messages.slice(-MAX_CONTEXT_MESSAGES);

  let prompt = '';
  if (memoryDigest) {
    prompt += `[CONVERSATION SUMMARY SO FAR]\n${memoryDigest}\n\n`;
  }

  prompt += '[RECENT MESSAGES]\n';
  for (const msg of recentMessages) {
    const role = msg.role === 'user' ? 'User' : 'Interviewer';
    prompt += `${role}: ${msg.content}\n`;
  }

  prompt += '\nRespond with the JSON object now.';
  return prompt;
}

// ── JSON parse helper ──

function parseJsonFromText(text: string): Record<string, unknown> {
  const trimmed = String(text || '').trim();
  if (!trimmed) throw new Error('Empty text');

  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  const jsonText = codeBlockMatch ? codeBlockMatch[1]!.trim() : trimmed;

  const parsed = JSON.parse(jsonText);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Parsed value is not an object');
  }
  return parsed as Record<string, unknown>;
}

// ── Signal filtering ──

function filterSignals(
  raw: Array<{ key: string; weight: number; evidence: string }>,
  turnIndex: number,
  messageId: string,
): InterviewTurnSignal[] {
  const result: InterviewTurnSignal[] = [];
  for (const s of raw) {
    if (!VALID_SIGNAL_KEYS.has(s.key)) continue;
    if (!VALID_WEIGHTS.has(s.weight)) continue;
    result.push({
      turnIndex,
      messageId,
      key: s.key,
      weight: s.weight,
      evidence: typeof s.evidence === 'string' ? s.evidence.slice(0, 100) : '',
    });
  }
  return result;
}

// ── Main engine ──

export type InterviewTurnInput = {
  runtimeClient: ModRuntimeClient;
  userMessage: string;
  userMessageId?: string;
  messages: InterviewMessage[];
  signals: InterviewTurnSignal[];
  memoryDigest: string;
  turnCount: number;
  validTurnCount: number;
  interests: string[];
  language: string;
  binding?: RuntimeRouteBinding | null;
};

export type InterviewTurnResult = {
  assistantReply: string;
  newSignals: InterviewTurnSignal[];
  memoryDigest: string;
  turnControl: InterviewTurnOutput['turnControl'];
  isValidTurn: boolean;
};

export async function processInterviewTurn(
  input: InterviewTurnInput,
): Promise<MintYouResult<InterviewTurnResult>> {
  const {
    runtimeClient,
    userMessage,
    userMessageId,
    messages,
    signals,
    memoryDigest,
    turnCount,
    validTurnCount,
    interests,
    language,
    binding,
  } = input;

  // Use the caller-provided message ID for signal attribution.
  // For the opening turn (no user message), fall back to a generated ID.
  const effectiveMsgId = userMessageId || createUlid();

  // Attempt up to 3 tries with progressively lower temperatures
  for (let attempt = 0; attempt < MAX_TURN_ATTEMPTS; attempt++) {
    try {
      const systemPrompt = buildSystemPrompt({
        interests,
        signals,
        turnCount,
        validTurnCount,
        language,
      });

      // messages already includes the user message added by the UI layer
      const prompt = buildUserPrompt({ messages, memoryDigest });

      const result = await runtimeClient.ai.text.generate({
        input: prompt,
        system: systemPrompt,
        maxTokens: 1536,
        temperature: attempt === 0 ? 0.6 : (attempt === 1 ? 0.3 : 0.2),
        binding: binding || undefined,
      });

      const parsedObject = parseJsonFromText(result.text);
      const validation = InterviewTurnOutputSchema.safeParse(parsedObject);
      if (!validation.success) {
        const issues = validation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
        emitMintYouLog({
          level: 'warn',
          message: 'action:interview-turn:validate-failed',
          source: 'processInterviewTurn',
          details: { issues, attempt },
        });
        if (attempt < MAX_TURN_ATTEMPTS - 1) continue; // retry
        return {
          ok: false,
          error: {
            reasonCode: MINTYOU_REASON.INTERVIEW_TURN_FAILED,
            message: `Interview turn validation failed: ${issues}`,
            actionHint: 'Try sending your message again.',
          },
        };
      }

      const output = validation.data as InterviewTurnOutput;

      // Filter signals to whitelist; discard all signals for the opening turn (empty user message)
      const hasUserContent = userMessage.trim().length > 0;
      const newSignals = hasUserContent
        ? filterSignals(output.traitSignals, turnCount, effectiveMsgId)
        : [];
      const isValidTurn = hasUserContent && newSignals.length > 0;

      // Clamp suggestedEnd: engine-level enforcement
      let suggestedEnd = output.turnControl.suggestedEnd;
      if (validTurnCount + (isValidTurn ? 1 : 0) < MIN_VALID_TURNS) {
        suggestedEnd = false;
      }

      emitMintYouLog({
        level: 'info',
        message: 'action:interview-turn:completed',
        source: 'processInterviewTurn',
        details: {
          turnCount,
          validTurnCount: validTurnCount + (isValidTurn ? 1 : 0),
          signalCount: newSignals.length,
          isValidTurn,
          suggestedEnd,
          phase: output.turnControl.phase,
        },
      });

      return {
        ok: true,
        data: {
          assistantReply: output.assistantReply,
          newSignals,
          memoryDigest: output.memoryDigest,
          turnControl: {
            ...output.turnControl,
            suggestedEnd,
          },
          isValidTurn,
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error || '');
      emitMintYouLog({
        level: 'error',
        message: 'action:interview-turn:error',
        source: 'processInterviewTurn',
        details: { error: msg, attempt },
      });
      if (attempt < MAX_TURN_ATTEMPTS - 1) continue; // retry
      return {
        ok: false,
        error: {
          reasonCode: MINTYOU_REASON.INTERVIEW_TURN_FAILED,
          message: `Interview turn failed: ${msg}`,
          actionHint: 'Try sending your message again.',
        },
      };
    }
  }

  // Should be unreachable, but satisfy TS
  return {
    ok: false,
    error: {
      reasonCode: MINTYOU_REASON.INTERVIEW_TURN_FAILED,
      message: 'Interview turn failed after retries.',
      actionHint: 'Try sending your message again.',
    },
  };
}

// ── Turn flow control queries ──

export function shouldForceEnd(turnCount: number, validTurnCount: number): boolean {
  // Hard limit: 12 turns forces end regardless
  if (turnCount >= MAX_TURNS) return true;
  // Soft limit: 10+ turns AND enough valid turns
  if (turnCount >= SOFT_MAX_TURNS && validTurnCount >= MIN_VALID_TURNS) return true;
  return false;
}

export function canUserEnd(validTurnCount: number): boolean {
  return validTurnCount >= MIN_VALID_TURNS;
}

export function isDegradedEnd(turnCount: number, validTurnCount: number): boolean {
  return turnCount >= MAX_TURNS && validTurnCount < MIN_VALID_TURNS;
}

export function needsExtension(turnCount: number, validTurnCount: number): boolean {
  return turnCount >= SOFT_MAX_TURNS && validTurnCount < MIN_VALID_TURNS;
}

export { MIN_VALID_TURNS, MAX_TURNS, SOFT_MAX_TURNS, MAX_CONTEXT_MESSAGES };
