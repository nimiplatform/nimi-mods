import type {
    TextplayLanguage,
    TextplayPersistRecord,
    TextplayPresenceReport,
    TextplayRunEvent,
    TextplayRunSnapshot,
    TextplayWarning,
} from '../types.js';
import { createUlid } from '../utils/ulid.js';
import { normalizeTextplayLanguage } from '../language.js';

export function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object') {
        return null;
    }
    return value as Record<string, unknown>;
}
export function toTrimmedString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}
const ENTITY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{1,}$/;
export function isEntityId(value: string): boolean {
    return ENTITY_ID_PATTERN.test(value);
}
export function uniqueStrings(values: string[]): string[] {
    return [...new Set(values.map((item) => item.trim()).filter(Boolean))];
}
export function parseWorldIdFromStoryId(storyId: string): string {
    const parts = storyId.split('.');
    if (parts.length >= 3 && parts[0] === 'story') {
        return parts[1] || '';
    }
    return '';
}
export function toPlayerProfileScope(worldId: string): string {
    const normalized = worldId.trim();
    return normalized || '__global__';
}
export function parseRunEvent(value: unknown): TextplayRunEvent | null {
    const record = asRecord(value);
    if (!record) {
        return null;
    }
    const traceId = toTrimmedString(record.traceId);
    const runId = toTrimmedString(record.runId);
    const stage = toTrimmedString(record.stage);
    const step = toTrimmedString(record.step);
    const eventType = toTrimmedString(record.eventType);
    const seq = Number(record.seq);
    const attempt = Number(record.attempt);
    const timestamp = toTrimmedString(record.timestamp);
    if (!traceId || !runId || !stage || !step || !eventType || !Number.isFinite(seq) || !Number.isFinite(attempt) || !timestamp) {
        return null;
    }
    return {
        traceId,
        runId,
        parentRunId: typeof record.parentRunId === 'string' ? record.parentRunId : null,
        taskId: typeof record.taskId === 'string' ? record.taskId : undefined,
        stage: 'textplay',
        step,
        eventType: eventType as TextplayRunEvent['eventType'],
        seq: Math.floor(seq),
        attempt: Math.floor(attempt),
        timestamp,
        reasonCode: typeof record.reasonCode === 'string' ? record.reasonCode : undefined,
        actionHint: typeof record.actionHint === 'string' ? record.actionHint : undefined,
        retryClass: record.retryClass === 'retryable' || record.retryClass === 'non-retryable'
            ? record.retryClass
            : undefined,
        idempotencyKey: typeof record.idempotencyKey === 'string' ? record.idempotencyKey : undefined,
        checkpointToken: typeof record.checkpointToken === 'string' ? record.checkpointToken : undefined,
        stepInputHash: typeof record.stepInputHash === 'string' ? record.stepInputHash : undefined,
        lastCompletedUnit: typeof record.lastCompletedUnit === 'string' ? record.lastCompletedUnit : undefined,
    };
}
export function parseRunEvents(value: unknown): TextplayRunEvent[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map(parseRunEvent)
        .filter((item): item is TextplayRunEvent => item !== null)
        .sort((left, right) => left.seq - right.seq);
}
export function parseWarning(value: unknown): TextplayWarning | null {
    const record = asRecord(value);
    if (!record) {
        return null;
    }
    const code = toTrimmedString(record.code);
    const stage = toTrimmedString(record.stage);
    const actionHint = toTrimmedString(record.actionHint);
    const message = toTrimmedString(record.message);
    const at = toTrimmedString(record.at);
    if (!code || !stage || !actionHint || !message || !at) {
        return null;
    }
    return {
        code,
        stage,
        actionHint,
        message,
        at,
    };
}
export function parseWarnings(value: unknown): TextplayWarning[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map(parseWarning)
        .filter((item): item is TextplayWarning => item !== null);
}
export function parsePresenceReport(value: unknown): TextplayPresenceReport | null {
    const record = asRecord(value);
    if (!record) {
        return null;
    }
    const id = toTrimmedString(record.id);
    const at = toTrimmedString(record.at);
    const fromState = toTrimmedString(record.fromState);
    const toState = toTrimmedString(record.toState);
    const event = toTrimmedString(record.event);
    if (!id || !at || !fromState || !toState || !event) {
        return null;
    }
    return {
        id,
        at,
        fromState: fromState as TextplayPresenceReport['fromState'],
        toState: toState as TextplayPresenceReport['toState'],
        event,
    };
}
export function parsePresenceReports(value: unknown): TextplayPresenceReport[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map(parsePresenceReport)
        .filter((item): item is TextplayPresenceReport => item !== null);
}
export function parseRunSnapshot(value: unknown): TextplayRunSnapshot | null {
    const record = asRecord(value);
    if (!record) {
        return null;
    }
    const status = toTrimmedString(record.status);
    const lastSeq = Number(record.lastSeq);
    const lastCompletedStep = toTrimmedString(record.lastCompletedStep);
    const checkpointToken = toTrimmedString(record.checkpointToken);
    const stepInputHash = toTrimmedString(record.stepInputHash);
    const lastCompletedUnit = toTrimmedString(record.lastCompletedUnit);
    const gapRefillApplied = Boolean(record.gapRefillApplied);
    if (!status || !Number.isFinite(lastSeq) || !lastCompletedStep || !checkpointToken || !stepInputHash || !lastCompletedUnit) {
        return null;
    }
    return {
        status: status as TextplayRunSnapshot['status'],
        lastSeq: Math.floor(lastSeq),
        lastCompletedStep,
        checkpointToken,
        stepInputHash,
        lastCompletedUnit,
        gapRefillApplied,
        terminalEventType: typeof record.terminalEventType === 'string'
            ? (record.terminalEventType as TextplayRunSnapshot['terminalEventType'])
            : undefined,
    };
}
export function parsePersistRecord(value: unknown): TextplayPersistRecord | null {
    const record = asRecord(value);
    if (!record) {
        return null;
    }
    const storyId = toTrimmedString(record.storyId);
    const worldId = toTrimmedString(record.worldId) || parseWorldIdFromStoryId(storyId);
    const agentId = toTrimmedString(record.agentId);
    const turnId = toTrimmedString(record.turnId);
    const runId = toTrimmedString(record.runId);
    const traceId = toTrimmedString(record.traceId);
    const userId = toTrimmedString(record.userId);
    const storyLanguage = normalizeTextplayLanguage(record.storyLanguage);
    const openingPayload = asRecord(asRecord(record.systemPayload)?.opening);
    const playerIdentity = firstNonEmptyText([
        record.playerIdentity,
        openingPayload?.playerIdentity,
        openingPayload?.playerRole,
    ]);
    if (!storyId || !turnId || !runId || !traceId || !userId || !storyLanguage) {
        return null;
    }
    const runSnapshot = parseRunSnapshot(record.runSnapshot);
    if (!runSnapshot) {
        return null;
    }
    return {
        id: toTrimmedString(record.id) || createUlid(),
        storyId,
        worldId,
        agentId,
        storyLanguage: storyLanguage as TextplayLanguage,
        turnId,
        runId,
        traceId,
        triggerSource: (toTrimmedString(record.triggerSource) || 'UserTurn') as TextplayPersistRecord['triggerSource'],
        userId,
        playerIdentity: playerIdentity || undefined,
        userMessage: typeof record.userMessage === 'string' ? record.userMessage : '',
        systemPayload: record.systemPayload && typeof record.systemPayload === 'object'
            ? (record.systemPayload as Record<string, unknown>)
            : null,
        text: typeof record.text === 'string' ? record.text : '',
        meta: record.meta && typeof record.meta === 'object'
            ? record.meta as TextplayPersistRecord['meta']
            : {
                storyId,
                turnId,
                runId,
                traceId,
                promptTraceId: '',
                route: {
                    source: '',
                    connectorId: '',
                    model: '',
                    provider: '',
                    endpoint: '',
                },
                sourceEventIds: [],
                warnings: [],
                presenceReports: [],
                runSnapshot,
            },
        runEvents: parseRunEvents(record.runEvents),
        runSnapshot,
        warnings: parseWarnings(record.warnings),
        presenceReports: parsePresenceReports(record.presenceReports),
        createdAt: toTrimmedString(record.createdAt) || new Date().toISOString(),
        updatedAt: toTrimmedString(record.updatedAt) || new Date().toISOString(),
    };
}
export function parsePersistRecordList(value: unknown): TextplayPersistRecord[] {
    const envelope = asRecord(value);
    if (!envelope) {
        return [];
    }
    const recordsRaw = Array.isArray(envelope.records) ? envelope.records : [];
    return recordsRaw
        .map(parsePersistRecord)
        .filter((item): item is TextplayPersistRecord => item !== null)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}
export function firstNonEmptyText(values: unknown[]): string {
    for (const value of values) {
        const text = toTrimmedString(value);
        if (text) {
            return text;
        }
    }
    return '';
}
