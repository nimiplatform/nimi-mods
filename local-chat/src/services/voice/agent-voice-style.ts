import type { LocalChatTarget } from '../../data/types.js';
import { pt, type PromptLocale } from '../../prompt/prompt-locale.js';

export type AgentVoiceStylePrompt = {
  language?: string;
  stylePrompt: string;
};

function compactText(value: unknown, max = 220): string {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}…`;
}

function readRecordString(record: unknown, key: string): string {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return '';
  return compactText((record as Record<string, unknown>)[key], 120);
}

function readNestedString(record: unknown, path: string[]): string {
  let current: unknown = record;
  for (const key of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return '';
    current = (current as Record<string, unknown>)[key];
  }
  return compactText(current, 120);
}

function inferLanguageFromText(text: string): string | undefined {
  if (/[\u3040-\u30ff]/u.test(text)) return 'ja';
  if (/[\uac00-\ud7af]/u.test(text)) return 'ko';
  if (/[\u4e00-\u9fff]/u.test(text)) return 'zh';
  if (/[A-Za-z]/.test(text)) return 'en';
  return undefined;
}

function inferLanguage(target: LocalChatTarget | null, message: string): string | undefined {
  const fromMessage = inferLanguageFromText(message);
  if (fromMessage) return fromMessage;

  const profile = target?.agentProfile || {};
  const world = target?.world || {};
  const lang = readRecordString(profile, 'language')
    || readRecordString(profile, 'locale')
    || readRecordString(world, 'language')
    || readRecordString(world, 'locale');
  const normalized = lang.toLowerCase();
  if (!normalized) return undefined;
  if (normalized.startsWith('zh')) return 'zh';
  if (normalized.startsWith('ja')) return 'ja';
  if (normalized.startsWith('ko')) return 'ko';
  if (normalized.startsWith('en')) return 'en';
  return normalized;
}

/**
 * Build voice style instructions from agent DNA for DashScope instruct mode.
 *
 * DashScope `instructions` constraints:
 * - Chinese / English only
 * - Max 1600 tokens
 * - Describe: pitch, speed, emotion, characteristics, usage context
 *
 * The actual text to speak is in `input.text` — do NOT include it in instructions.
 */
export function buildAgentVoiceStylePrompt(input: {
  target: LocalChatTarget | null;
  messageText: string;
  promptLocale?: PromptLocale;
}): AgentVoiceStylePrompt {
  const target = input.target;
  const displayName = compactText(target?.displayName || target?.handle || 'the agent', 80);
  const bio = compactText(target?.bio || '', 220);
  const profile = target?.agentProfile || {};
  const dna = (typeof (profile as Record<string, unknown>).dna === 'object' && (profile as Record<string, unknown>).dna)
    ? (profile as Record<string, unknown>).dna as Record<string, unknown>
    : null;
  const world = target?.world || {};

  // Voice style sources (priority: explicit voiceStyle > dna > profile fields)
  const tone = readRecordString(profile, 'tone')
    || readRecordString(profile, 'style')
    || readRecordString(profile, 'voiceStyle')
    || (dna ? readNestedString(dna, ['interaction', 'defaultTone']) : '');
  const persona = readRecordString(profile, 'persona')
    || readRecordString(profile, 'summary')
    || (dna ? readRecordString(dna, 'summary') : '');
  const coreIdentity = dna ? readNestedString(dna, ['soul', 'coreIdentity']) : '';
  const worldName = readRecordString(world, 'name') || readRecordString(world, 'title');

  // Build instructions — focus on voice characteristics, no repeated text content
  const locale = input.promptLocale || 'en';
  const styleBlocks = [
    pt(locale, 'voice.role', { name: displayName }),
    coreIdentity ? pt(locale, 'voice.identity', { value: coreIdentity }) : '',
    persona ? pt(locale, 'voice.persona', { value: persona }) : '',
    bio ? pt(locale, 'voice.bio', { value: bio }) : '',
    tone ? pt(locale, 'voice.tone', { value: tone }) : pt(locale, 'voice.toneDefault'),
    worldName ? pt(locale, 'voice.world', { value: worldName }) : '',
    pt(locale, 'voice.inCharacter'),
    pt(locale, 'voice.keepConcise'),
  ].filter(Boolean);

  return {
    language: inferLanguage(target, input.messageText),
    stylePrompt: styleBlocks.join(' '),
  };
}
