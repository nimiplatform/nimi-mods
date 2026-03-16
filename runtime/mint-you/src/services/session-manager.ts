import type { MintYouSession, BasicInfo, TraitExtractionResult, DnaSynthesisOutput, InterviewMessage, InterviewTurnSignal, SocialProfile, MintYouInterviewLanguage, } from '../types.js';
import type { MintYouPipelineStep, DnaPrimaryType, DnaSecondaryTrait, RelationshipMode, FormalityValue, SentimentValue, } from '../contracts.js';
import { emitMintYouLog } from '../logging.js';
import { readStoredState, removeStoredState, writeStoredState, } from './storage-state.js';
import { parseInterviewLanguage } from '../utils/interview-language.js';
import { type HookClient } from "@nimiplatform/sdk/mod";
export const SESSION_VERSION = 4;
const SESSION_KEY_PREFIX = 'mint-you:session:';
const SESSION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_PERSISTED_MESSAGES = 8;
const MAX_MEMORY_DIGEST_LENGTH = 2000;
const MAX_SIGNALS_PER_TURN = 8;
const MAX_EVIDENCE_LENGTH = 100;
function normalizeScopeKey(scopeKey: string): string {
    const normalized = String(scopeKey || '').trim();
    return normalized || 'anonymous';
}
function getSessionKey(scopeKey: string): string {
    return `${SESSION_KEY_PREFIX}${normalizeScopeKey(scopeKey)}`;
}
function parseSession(raw: string | null): MintYouSession | null {
    if (!raw)
        return null;
    try {
        const parsed = JSON.parse(raw) as MintYouSession;
        if (!parsed || typeof parsed !== 'object')
            return null;
        // Version check: reject sessions from older schema
        if ((parsed.sessionVersion ?? 0) !== SESSION_VERSION)
            return null;
        return {
            ...parsed,
            interviewLanguage: parseInterviewLanguage(parsed.interviewLanguage),
        };
    }
    catch {
        return null;
    }
}
/**
 * Trim session data before host-backed mod storage persistence to avoid storing oversized transient blobs.
 * - Exclude data: URL photos (only keep in memory)
 * - Trim interview messages to most recent N
 * - Clamp memoryDigest length
 * - Clamp signal evidence length and per-turn count
 */
function trimForPersistence(session: MintYouSession): MintYouSession {
    // Exclude data: URL photos
    const referenceImageUrl = session.referenceImageUrl?.startsWith('data:')
        ? null
        : session.referenceImageUrl;
    // Keep only the most recent messages
    const interviewMessages = session.interviewMessages.slice(-MAX_PERSISTED_MESSAGES);
    // Clamp memoryDigest
    const memoryDigest = session.memoryDigest.slice(0, MAX_MEMORY_DIGEST_LENGTH);
    // Trim signals: cap per-turn and evidence length
    const turnSignalCounts = new Map<number, number>();
    const interviewSignals: InterviewTurnSignal[] = [];
    for (const signal of session.interviewSignals) {
        const count = turnSignalCounts.get(signal.turnIndex) ?? 0;
        if (count >= MAX_SIGNALS_PER_TURN)
            continue;
        turnSignalCounts.set(signal.turnIndex, count + 1);
        interviewSignals.push({
            ...signal,
            evidence: signal.evidence.slice(0, MAX_EVIDENCE_LENGTH),
        });
    }
    return {
        ...session,
        referenceImageUrl,
        interviewMessages,
        interviewSignals,
        memoryDigest,
    };
}
export async function saveSession(scopeKey: string, session: MintYouSession, options?: {
    hookClient?: HookClient | null;
}): Promise<string | null> {
    const key = getSessionKey(scopeKey);
    const trimmed = trimForPersistence({ ...session, updatedAt: Date.now() });
    const data = JSON.stringify(trimmed);
    const hookClient = options?.hookClient ?? null;
    if (!hookClient)
        return null;
    const ok = await writeStoredState(hookClient.storage, key, data);
    if (!ok) {
        emitMintYouLog({
            level: 'warn',
            message: 'action:session:persist-failed',
            source: 'saveSession',
            details: { scopeKey, dataLength: data.length },
        });
        return 'Progress may not have been saved. This won\'t affect your current session.';
    }
    return null;
}
export async function loadSession(scopeKey: string, options?: {
    hookClient?: HookClient | null;
}): Promise<MintYouSession | null> {
    const key = getSessionKey(scopeKey);
    const hookClient = options?.hookClient ?? null;
    if (!hookClient)
        return null;
    const remote = await readStoredState(hookClient.storage, key);
    return parseSession(remote);
}
export async function clearSession(scopeKey: string, options?: {
    hookClient?: HookClient | null;
}): Promise<void> {
    const key = getSessionKey(scopeKey);
    const hookClient = options?.hookClient ?? null;
    if (!hookClient)
        return;
    await removeStoredState(hookClient.storage, key);
}
export function isSessionExpired(session: MintYouSession): boolean {
    const now = Date.now();
    return (now - session.updatedAt) > SESSION_EXPIRY_MS;
}
export function buildSessionSnapshot(input: {
    sessionId: string;
    userId: string;
    currentStep: MintYouPipelineStep;
    basicInfo: BasicInfo | null;
    selectedInterests: string[];
    selfReportedMbti: SocialProfile['selfReportedMbti'];
    currentFocus: string;
    interviewMessages: InterviewMessage[];
    interviewSignals: InterviewTurnSignal[];
    interviewTurnCount: number;
    interviewValidTurnCount: number;
    interviewLanguage: MintYouInterviewLanguage | null;
    memoryDigest: string;
    traitResult: TraitExtractionResult | null;
    dnaSynthesis: DnaSynthesisOutput | null;
    traitOverrides: {
        dnaPrimary?: DnaPrimaryType;
        dnaSecondary?: DnaSecondaryTrait[];
        relationshipMode?: RelationshipMode;
        formality?: FormalityValue;
        sentiment?: SentimentValue;
    } | null;
    referenceImageUrl: string | null;
    worldId: string | null;
    confirmed: boolean;
    createdAgentId: string | null;
}): MintYouSession {
    const now = Date.now();
    return {
        sessionVersion: SESSION_VERSION,
        sessionId: input.sessionId,
        userId: input.userId,
        currentStep: input.currentStep,
        basicInfo: input.basicInfo,
        selectedInterests: input.selectedInterests,
        selfReportedMbti: input.selfReportedMbti,
        currentFocus: input.currentFocus,
        interviewMessages: input.interviewMessages,
        interviewSignals: input.interviewSignals,
        interviewTurnCount: input.interviewTurnCount,
        interviewValidTurnCount: input.interviewValidTurnCount,
        interviewLanguage: input.interviewLanguage,
        memoryDigest: input.memoryDigest,
        traitResult: input.traitResult,
        dnaSynthesis: input.dnaSynthesis,
        traitOverrides: input.traitOverrides,
        referenceImageUrl: input.referenceImageUrl,
        worldId: input.worldId,
        confirmed: input.confirmed,
        createdAgentId: input.createdAgentId,
        createdAt: now,
        updatedAt: now,
    };
}
