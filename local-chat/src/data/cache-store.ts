import type { LocalChatTarget } from './types.js';

export const PROFILE_DENY_CACHE_TTL_MS = 60_000;
export const TARGETS_CACHE_TTL_MS = 3_000;

export const targetDetailCache = new Map<string, LocalChatTarget>();
export const targetDetailInFlight = new Map<string, Promise<LocalChatTarget | null>>();
export const worldCache = new Map<string, Record<string, unknown> | null>();
export const worldviewCache = new Map<string, Record<string, unknown> | null>();
export const profileDenyCache = new Map<string, number>();

let targetsListCache: LocalChatTarget[] | null = null;
let targetsListCacheAt = 0;
let targetsListInFlight: Promise<LocalChatTarget[]> | null = null;

export function getTargetsListCache(): LocalChatTarget[] | null {
  if (!targetsListCache || Date.now() - targetsListCacheAt > TARGETS_CACHE_TTL_MS) {
    return null;
  }
  return targetsListCache;
}

export function setTargetsListCache(value: LocalChatTarget[]): void {
  targetsListCache = value;
  targetsListCacheAt = Date.now();
}

export function getTargetsListInFlight(): Promise<LocalChatTarget[]> | null {
  return targetsListInFlight;
}

export function setTargetsListInFlight(value: Promise<LocalChatTarget[]> | null): void {
  targetsListInFlight = value;
}

export function resetLocalChatDataCaches(): void {
  targetDetailCache.clear();
  targetDetailInFlight.clear();
  worldCache.clear();
  worldviewCache.clear();
  profileDenyCache.clear();
  targetsListCache = null;
  targetsListCacheAt = 0;
  targetsListInFlight = null;
}
