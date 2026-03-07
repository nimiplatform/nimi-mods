import type { KismetCanonicalProfile, KismetLocalShareProfile } from '../types.js';
import { createUlid } from '../utils/ulid.js';

const STORAGE_KEY = 'nimi.kismet.local-share-profiles.v2';

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function loadLocalShareProfiles(): KismetLocalShareProfile[] {
  if (!canUseStorage()) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as KismetLocalShareProfile[] : [];
  } catch {
    return [];
  }
}

export function persistLocalShareProfiles(profiles: KismetLocalShareProfile[]): void {
  if (!canUseStorage()) {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
}

export function createLocalShareProfile(displayName: string, canonicalProfile: KismetCanonicalProfile): KismetLocalShareProfile {
  return {
    id: createUlid(),
    displayName,
    createdAt: new Date().toISOString(),
    canonicalProfile: {
      dayMaster: canonicalProfile.dayMaster,
      fiveElementRatio: canonicalProfile.fiveElementRatio,
      favorableElements: canonicalProfile.favorableElements,
      unfavorableElements: canonicalProfile.unfavorableElements,
      compatibleArchetypes: canonicalProfile.compatibleArchetypes,
      conflictArchetypes: canonicalProfile.conflictArchetypes,
    },
  };
}
