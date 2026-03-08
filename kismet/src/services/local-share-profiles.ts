import type { KismetBirthInputV2, KismetCanonicalProfile, KismetFortuneStickResult, KismetLocalShareProfile, KismetNatalAnalysisResult } from '../types.js';
import { createUlid } from '../utils/ulid.js';

const STORAGE_KEY = 'nimi.kismet.local-share-profiles.v2';
const PRIMARY_PROFILE_KEY = 'nimi.kismet.primary-profile.v1';
const FORTUNE_STICK_KEY = 'nimi.kismet.fortune-stick.v1';

export type KismetPrimaryProfile = {
  birthInput: KismetBirthInputV2;
  canonicalProfile: KismetCanonicalProfile;
  natalResult?: KismetNatalAnalysisResult;
  savedAt: string;
};

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function loadPrimaryProfile(): KismetPrimaryProfile | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(PRIMARY_PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as KismetPrimaryProfile;
    if (parsed && parsed.birthInput && parsed.canonicalProfile) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function persistPrimaryProfile(profile: KismetPrimaryProfile): void {
  if (!canUseStorage()) return;
  window.localStorage.setItem(PRIMARY_PROFILE_KEY, JSON.stringify(profile));
}

export function clearPrimaryProfile(): void {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(PRIMARY_PROFILE_KEY);
}

export type KismetCachedFortuneStick = {
  result: KismetFortuneStickResult;
  date: string;
  savedAt: string;
};

export function loadCachedFortuneStick(): KismetCachedFortuneStick | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(FORTUNE_STICK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as KismetCachedFortuneStick;
    if (parsed && parsed.result && parsed.date) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function persistFortuneStick(cached: KismetCachedFortuneStick): void {
  if (!canUseStorage()) return;
  window.localStorage.setItem(FORTUNE_STICK_KEY, JSON.stringify(cached));
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
