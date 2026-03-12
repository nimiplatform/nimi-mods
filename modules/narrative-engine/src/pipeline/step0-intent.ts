import { NARRATIVE_ENGINE_DATA_API_WORLD_ACCESS_ME, NARRATIVE_REASON_CODES, } from '../contracts.js';
import { NarrativeTurnInputSchema } from '../schemas.js';
import type { NarrativeStepResult, NarrativeTurnInput, NarrativeTurnInputNormalized, } from '../types.js';
import { createUlid } from '../utils/ulid.js';
import { asRecord } from "@nimiplatform/sdk/mod";
function toIssueMessage(error: unknown): string {
    if (!error || typeof error !== 'object') {
        return 'invalid-input';
    }
    const record = error as {
        issues?: Array<{
            path?: Array<string | number>;
            message?: string;
        }>;
    };
    if (!Array.isArray(record.issues)) {
        return 'invalid-input';
    }
    return record.issues
        .map((issue) => {
        const path = Array.isArray(issue.path) ? issue.path.join('.') : '';
        return `${path || 'input'}:${issue.message || 'invalid'}`;
    })
        .join('; ');
}
function buildActionHintForInputInvalid(error: unknown): string {
    const issueMessage = toIssueMessage(error);
    return issueMessage || 'Fix turn input fields and retry.';
}
function normalizeTurnInput(input: NarrativeTurnInput): NarrativeTurnInputNormalized {
  const nowMs = Number.isFinite(input.nowMs) ? Number(input.nowMs) : Date.now();
  const traceId = String(input.traceId || '').trim() || createUlid(nowMs);
  const runId = String(input.runId || '').trim() || createUlid(nowMs + 4);
  const taskIdRaw = String(input.taskId || '').trim() || createUlid(nowMs + 5);
  const taskId = taskIdRaw === runId ? createUlid(nowMs + 6) : taskIdRaw;
  const systemContext = asRecord(input.systemContext);
  const openingPayload = asRecord(systemContext.opening);
  return {
    storyId: String(input.storyId || '').trim(),
    entryEventId: String(input.entryEventId || openingPayload.entryEventId || '').trim(),
    worldId: String(input.worldId || '').trim(),
    agentId: String(input.agentId || '').trim(),
    userId: String(input.userId || '').trim(),
    triggerSource: input.triggerSource,
    userMessage: String(input.userMessage || '').trim(),
    systemContext,
    idempotencyKey: String(input.idempotencyKey || '').trim() || createUlid(nowMs + 1),
        capability: input.capability || 'text.generate',
        binding: asRecord(input.binding),
        turnId: String(input.turnId || '').trim() || createUlid(nowMs + 2),
        requestId: String(input.requestId || '').trim() || createUlid(nowMs + 3),
        traceId,
        parentRunId: typeof input.parentRunId === 'string' && input.parentRunId.trim()
            ? input.parentRunId.trim()
            : null,
        runId,
        taskId,
        presence: String(input.presence || '').trim(),
        nowMs,
        cancelRequested: Boolean(input.cancelRequested),
        mockCoreOutput: input.mockCoreOutput || null,
        receivedAt: new Date(nowMs).toISOString(),
    };
}
function resolveWorldAccessGranted(payload: unknown, worldId: string): boolean {
    const record = asRecord(payload);
    if (record.hasActiveAccess === false) {
        return false;
    }
    const records = Array.isArray(record.records) ? record.records : [];
    if (records.length === 0) {
        return true;
    }
    const scopedWorldIds = records
        .map((item) => asRecord(item).scopeWorldId)
        .map((value) => String(value || '').trim())
        .filter(Boolean);
    if (scopedWorldIds.length === 0) {
        return true;
    }
    return scopedWorldIds.includes(worldId);
}
export async function runNarrativeStep0Intent(input: {
    rawInput: unknown;
    queryWorldAccess: (turn: NarrativeTurnInputNormalized) => Promise<unknown>;
}): Promise<NarrativeStepResult<NarrativeTurnInputNormalized>> {
    const parsed = NarrativeTurnInputSchema.safeParse(input.rawInput);
    if (!parsed.success) {
        return {
            ok: false,
            reasonCode: NARRATIVE_REASON_CODES.NARRATIVE_INPUT_INVALID,
            actionHint: buildActionHintForInputInvalid(parsed.error),
            value: null,
        };
    }
    const normalized = normalizeTurnInput(parsed.data as NarrativeTurnInput);
    try {
        const accessPayload = await input.queryWorldAccess(normalized);
        if (!resolveWorldAccessGranted(accessPayload, normalized.worldId)) {
            return {
                ok: false,
                reasonCode: NARRATIVE_REASON_CODES.NARRATIVE_CONTEXT_INSUFFICIENT,
                actionHint: 'Complete required context scopes and retry.',
                value: null,
            };
        }
    }
    catch {
        return {
            ok: false,
            reasonCode: NARRATIVE_REASON_CODES.NARRATIVE_CONTEXT_INSUFFICIENT,
            actionHint: `Query ${NARRATIVE_ENGINE_DATA_API_WORLD_ACCESS_ME} failed.`,
            value: null,
        };
    }
    return {
        ok: true,
        reasonCode: null,
        actionHint: 'step0-intent-passed',
        value: normalized,
    };
}
