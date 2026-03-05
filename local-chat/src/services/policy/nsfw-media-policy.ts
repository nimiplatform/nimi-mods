import type { ChatMessageMeta } from '../../types.js';

export type NsfwMediaPolicy = NonNullable<ChatMessageMeta['nsfwPolicy']>;

const NSFW_PROMPT_PATTERNS: RegExp[] = [
  /\bnsfw\b/i,
  /\berotic\b/i,
  /\bporn(?:ography)?\b/i,
  /\bxxx\b/i,
  /\bnude\b/i,
  /\bnaked\b/i,
  /\bsexual\b/i,
  /\bsex\b/i,
  /\badult\b/i,
  /\blingerie\b/i,
  /\bfetish\b/i,
  /\bexplicit\b/i,
  /\bbreast(?:s)?\b/i,
  /\bnipple(?:s)?\b/i,
  /\bgenital(?:ia)?\b/i,
  /\b18\+\b/i,
];

export function evaluateNsfwMediaPolicy(input: {
  allowNsfwMedia: boolean;
  routeSource: string;
}): NsfwMediaPolicy {
  if (!input.allowNsfwMedia) {
    return 'disabled';
  }
  return input.routeSource === 'local-runtime'
    ? 'allowed'
    : 'local-runtime-only';
}

export function isNsfwMediaAllowed(policy: NsfwMediaPolicy): boolean {
  return policy === 'allowed';
}

export function isPromptLikelyNsfw(prompt: string): boolean {
  const normalized = String(prompt || '').trim();
  if (!normalized) return false;
  return NSFW_PROMPT_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isMediaGenerationAllowed(input: {
  policy: NsfwMediaPolicy;
  routeSource: 'local-runtime' | 'token-api' | string;
  prompt?: string;
  isNsfwPrompt?: boolean;
}): boolean {
  const nsfwPrompt = input.isNsfwPrompt ?? isPromptLikelyNsfw(input.prompt || '');
  if (!nsfwPrompt) {
    return true;
  }
  if (input.policy === 'disabled') {
    return false;
  }
  if (input.policy === 'allowed') {
    return true;
  }
  return input.routeSource === 'local-runtime';
}
