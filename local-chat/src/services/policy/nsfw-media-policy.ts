import type { ChatMessageMeta } from '../../types.js';

export type NsfwMediaPolicy = NonNullable<ChatMessageMeta['nsfwPolicy']>;

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
