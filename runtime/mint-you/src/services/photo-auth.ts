import type { PhotoAuthState, PhotoAuthRecord, PhotoAuthSnapshot, } from '../types.js';
import { readModState, removeModState, writeModState, } from './mod-state.js';
import { type HookDataClient } from "@nimiplatform/sdk/mod";
const STORAGE_KEY_PREFIX = 'mint-you:photo-auth:';
const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
const VALID_STATES = new Set<PhotoAuthState>(['NONE', 'A_REQUESTED', 'MUTUAL', 'DECLINED']);
function makePairKey(userA: string, userB: string): string {
    return [userA, userB].sort().join(':');
}
function getStorageKey(userA: string, userB: string, worldId: string): string {
    return `${STORAGE_KEY_PREFIX}${makePairKey(userA, userB)}:${worldId}`;
}
function createNoneRecord(worldId: string): PhotoAuthRecord {
    return {
        state: 'NONE',
        requestedBy: null,
        declinedAt: null,
        worldId,
    };
}
function parseRecord(raw: string | null): PhotoAuthRecord | null {
    if (!raw)
        return null;
    try {
        const parsed = JSON.parse(raw) as Partial<PhotoAuthRecord>;
        const state = parsed.state;
        if (!state || !VALID_STATES.has(state)) {
            return null;
        }
        const worldId = typeof parsed.worldId === 'string' ? parsed.worldId.trim() : '';
        if (!worldId) {
            return null;
        }
        return {
            state,
            requestedBy: typeof parsed.requestedBy === 'string' ? parsed.requestedBy : null,
            declinedAt: typeof parsed.declinedAt === 'number' ? parsed.declinedAt : null,
            worldId,
        };
    }
    catch {
        return null;
    }
}
async function loadRecord(dataClient: HookDataClient, userA: string, userB: string, worldId: string): Promise<PhotoAuthRecord | null> {
    const key = getStorageKey(userA, userB, worldId);
    const raw = await readModState(dataClient, key);
    return parseRecord(raw);
}
async function saveRecord(dataClient: HookDataClient, userA: string, userB: string, worldId: string, record: PhotoAuthRecord): Promise<void> {
    const key = getStorageKey(userA, userB, worldId);
    await writeModState(dataClient, key, JSON.stringify(record));
}
async function removeRecord(dataClient: HookDataClient, userA: string, userB: string, worldId: string): Promise<void> {
    const key = getStorageKey(userA, userB, worldId);
    await removeModState(dataClient, key);
}
function computeCanRequest(record: PhotoAuthRecord | null, requesterId: string): boolean {
    if (!record)
        return true;
    if (record.state === 'NONE')
        return true;
    if (record.state === 'MUTUAL')
        return false;
    if (record.state === 'A_REQUESTED')
        return false;
    if (record.state === 'DECLINED') {
        if (record.requestedBy && record.requestedBy !== requesterId) {
            return true;
        }
        if (record.declinedAt && (Date.now() - record.declinedAt) >= COOLDOWN_MS) {
            return true;
        }
        return false;
    }
    return false;
}
function computeCooldownRemaining(record: PhotoAuthRecord | null, requesterId: string): number {
    if (!record || record.state !== 'DECLINED' || !record.declinedAt)
        return 0;
    if (record.requestedBy && record.requestedBy !== requesterId) {
        return 0;
    }
    const elapsed = Date.now() - record.declinedAt;
    return Math.max(0, COOLDOWN_MS - elapsed);
}
export async function readPhotoAuthSnapshot(dataClient: HookDataClient, currentUserId: string, otherUserId: string, worldId: string): Promise<PhotoAuthSnapshot> {
    const record = await loadRecord(dataClient, currentUserId, otherUserId, worldId);
    return {
        state: record?.state ?? 'NONE',
        requestedBy: record?.requestedBy ?? null,
        cooldownRemainingMs: computeCooldownRemaining(record, currentUserId),
        canRequest: computeCanRequest(record, currentUserId),
    };
}
export async function getAuthState(dataClient: HookDataClient, userA: string, userB: string, worldId: string): Promise<PhotoAuthState> {
    return (await loadRecord(dataClient, userA, userB, worldId))?.state ?? 'NONE';
}
export async function canRequest(dataClient: HookDataClient, requesterId: string, targetId: string, worldId: string): Promise<boolean> {
    const record = await loadRecord(dataClient, requesterId, targetId, worldId);
    return computeCanRequest(record, requesterId);
}
export async function getCooldownRemaining(dataClient: HookDataClient, requesterId: string, otherId: string, worldId: string): Promise<number> {
    const record = await loadRecord(dataClient, requesterId, otherId, worldId);
    return computeCooldownRemaining(record, requesterId);
}
export async function requestPhoto(dataClient: HookDataClient, requesterId: string, targetId: string, worldId: string): Promise<PhotoAuthRecord> {
    const existing = await loadRecord(dataClient, requesterId, targetId, worldId);
    if (!computeCanRequest(existing, requesterId)) {
        return existing ?? createNoneRecord(worldId);
    }
    const next: PhotoAuthRecord = {
        state: 'A_REQUESTED',
        requestedBy: requesterId,
        declinedAt: null,
        worldId,
    };
    await saveRecord(dataClient, requesterId, targetId, worldId, next);
    return next;
}
export async function respondToRequest(dataClient: HookDataClient, responderId: string, requesterId: string, worldId: string, accept: boolean): Promise<PhotoAuthRecord> {
    const existing = await loadRecord(dataClient, responderId, requesterId, worldId);
    if (!existing || existing.state !== 'A_REQUESTED' || existing.requestedBy !== requesterId) {
        return existing ?? createNoneRecord(worldId);
    }
    const next: PhotoAuthRecord = accept
        ? {
            state: 'MUTUAL',
            requestedBy: requesterId,
            declinedAt: null,
            worldId,
        }
        : {
            state: 'DECLINED',
            requestedBy: requesterId,
            declinedAt: Date.now(),
            worldId,
        };
    await saveRecord(dataClient, requesterId, responderId, worldId, next);
    return next;
}
export async function revokeAccess(dataClient: HookDataClient, userId: string, otherId: string, worldId: string): Promise<PhotoAuthRecord> {
    await removeRecord(dataClient, userId, otherId, worldId);
    return createNoneRecord(worldId);
}
export async function canSeePhoto(dataClient: HookDataClient, viewerId: string, ownerId: string, worldId: string): Promise<boolean> {
    if (viewerId === ownerId)
        return true;
    const state = await getAuthState(dataClient, viewerId, ownerId, worldId);
    return state === 'MUTUAL';
}
