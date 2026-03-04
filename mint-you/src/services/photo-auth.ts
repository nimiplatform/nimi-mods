import type { PhotoAuthState, PhotoAuthRecord } from '../types.js';

const STORAGE_KEY_PREFIX = 'mint-you:photo-auth:';
const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

function makePairKey(userA: string, userB: string): string {
  return [userA, userB].sort().join(':');
}

function getStorageKey(userA: string, userB: string, worldId: string): string {
  return `${STORAGE_KEY_PREFIX}${makePairKey(userA, userB)}:${worldId}`;
}

function loadRecord(userA: string, userB: string, worldId: string): PhotoAuthRecord | null {
  try {
    const key = getStorageKey(userA, userB, worldId);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as PhotoAuthRecord;
  } catch {
    return null;
  }
}

function saveRecord(userA: string, userB: string, worldId: string, record: PhotoAuthRecord): void {
  try {
    const key = getStorageKey(userA, userB, worldId);
    localStorage.setItem(key, JSON.stringify(record));
  } catch {
    // Silent fail
  }
}

function removeRecord(userA: string, userB: string, worldId: string): void {
  try {
    const key = getStorageKey(userA, userB, worldId);
    localStorage.removeItem(key);
  } catch {
    // Silent fail
  }
}

export function getAuthState(userA: string, userB: string, worldId: string): PhotoAuthState {
  const record = loadRecord(userA, userB, worldId);
  return record?.state ?? 'NONE';
}

export function canRequest(userA: string, userB: string, worldId: string): boolean {
  const record = loadRecord(userA, userB, worldId);
  if (!record) return true;
  if (record.state === 'NONE') return true;
  if (record.state === 'MUTUAL') return false;
  if (record.state === 'A_REQUESTED') return false;
  if (record.state === 'DECLINED') {
    if (record.declinedAt && (Date.now() - record.declinedAt) >= COOLDOWN_MS) {
      return true;
    }
    return false;
  }
  return false;
}

export function getCooldownRemaining(userA: string, userB: string, worldId: string): number {
  const record = loadRecord(userA, userB, worldId);
  if (!record || record.state !== 'DECLINED' || !record.declinedAt) return 0;
  const elapsed = Date.now() - record.declinedAt;
  return Math.max(0, COOLDOWN_MS - elapsed);
}

export function requestPhoto(requesterId: string, targetId: string, worldId: string): PhotoAuthState {
  saveRecord(requesterId, targetId, worldId, {
    state: 'A_REQUESTED',
    requestedBy: requesterId,
    declinedAt: null,
    worldId,
  });
  return 'A_REQUESTED';
}

export function respondToRequest(
  responderId: string,
  requesterId: string,
  worldId: string,
  accept: boolean,
): PhotoAuthState {
  if (accept) {
    saveRecord(requesterId, responderId, worldId, {
      state: 'MUTUAL',
      requestedBy: requesterId,
      declinedAt: null,
      worldId,
    });
    return 'MUTUAL';
  } else {
    saveRecord(requesterId, responderId, worldId, {
      state: 'DECLINED',
      requestedBy: requesterId,
      declinedAt: Date.now(),
      worldId,
    });
    return 'DECLINED';
  }
}

export function revokeAccess(userId: string, otherId: string, worldId: string): PhotoAuthState {
  removeRecord(userId, otherId, worldId);
  return 'NONE';
}

export function canSeePhoto(viewerId: string, ownerId: string, worldId: string): boolean {
  if (viewerId === ownerId) return true;
  const state = getAuthState(viewerId, ownerId, worldId);
  return state === 'MUTUAL';
}
