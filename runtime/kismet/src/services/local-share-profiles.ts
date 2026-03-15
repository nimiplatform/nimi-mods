import { createModKvStore, createModStorageClient } from '@nimiplatform/sdk/mod/storage';
import { KISMET_MOD_ID } from '../contracts.js';
import type { KismetBirthInputV2, KismetCanonicalProfile, KismetFortuneStickResult, KismetLocalShareProfile, KismetNatalAnalysisResult } from '../types.js';
import { createUlid } from '../utils/ulid.js';

const STORAGE_KEY = 'nimi.kismet.local-share-profiles.v2';
const PRIMARY_PROFILE_KEY = 'nimi.kismet.primary-profile.v1';
const FORTUNE_STICK_KEY = 'nimi.kismet.fortune-stick.v1';
let localShareStateStore: ReturnType<typeof createModKvStore> | null = null;

function getLocalShareStateStore() {
  if (!localShareStateStore) {
    localShareStateStore = createModKvStore({
      storage: createModStorageClient(KISMET_MOD_ID),
      namespace: 'kismet.local-share',
    });
  }
  return localShareStateStore;
}

export type KismetPrimaryProfile = {
  birthInput: KismetBirthInputV2;
  canonicalProfile: KismetCanonicalProfile;
  natalResult?: KismetNatalAnalysisResult;
  savedAt: string;
};

let primaryProfileCache: KismetPrimaryProfile | null = null;
let fortuneStickCache: KismetCachedFortuneStick | null = null;
let localProfilesCache: KismetLocalShareProfile[] = [];

export function loadPrimaryProfile(): KismetPrimaryProfile | null {
  return primaryProfileCache;
}

export async function persistPrimaryProfile(profile: KismetPrimaryProfile): Promise<void> {
  primaryProfileCache = profile;
  await getLocalShareStateStore().setJson(PRIMARY_PROFILE_KEY, profile);
}

export async function clearPrimaryProfile(): Promise<void> {
  primaryProfileCache = null;
  await getLocalShareStateStore().delete(PRIMARY_PROFILE_KEY);
}

export type KismetCachedFortuneStick = {
  result: KismetFortuneStickResult;
  date: string;
  savedAt: string;
};

export function loadCachedFortuneStick(): KismetCachedFortuneStick | null {
  return fortuneStickCache;
}

export async function persistFortuneStick(cached: KismetCachedFortuneStick): Promise<void> {
  fortuneStickCache = cached;
  await getLocalShareStateStore().setJson(FORTUNE_STICK_KEY, cached);
}

export function loadLocalShareProfiles(): KismetLocalShareProfile[] {
  return [...localProfilesCache];
}

export async function persistLocalShareProfiles(profiles: KismetLocalShareProfile[]): Promise<void> {
  localProfilesCache = [...profiles];
  await getLocalShareStateStore().setJson(STORAGE_KEY, profiles);
}

export async function hydrateLocalShareProfilesState(): Promise<void> {
  primaryProfileCache = await getLocalShareStateStore().getJson<KismetPrimaryProfile>(PRIMARY_PROFILE_KEY);
  fortuneStickCache = await getLocalShareStateStore().getJson<KismetCachedFortuneStick>(FORTUNE_STICK_KEY);
  localProfilesCache = await getLocalShareStateStore().getJson<KismetLocalShareProfile[]>(STORAGE_KEY) || [];
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
