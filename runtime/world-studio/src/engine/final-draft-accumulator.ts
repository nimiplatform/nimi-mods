import type {
  AgentProseCandidateField,
  DraftPatch,
  DraftPatchEvidenceRef,
  FinalDraftAccumulator,
  ProseCandidateDraft,
  ProseCandidateOperation,
  WorkingProseRecord,
  WorldProseCandidateField,
  WorldStudioAgentDraft,
} from './types.js';
import {
  AGENT_PROSE_FIELDS,
  PROSE_CANDIDATE_LIMIT,
  WORLD_PROSE_FIELDS,
  alignAgentStructuralDraft,
  alignWorldPatch,
  alignWorldviewPatch,
} from './realm-alignment.js';
import { asRecord } from "@nimiplatform/sdk/mod";

const REVISION_LIMIT = 120;
const WORKING_PROSE_CONFIDENCE_MIN = 0.75;
const SHORT_PROSE_MIN_CHARS = 8;
const LONG_PROSE_MIN_CHARS = 30;
const CANDIDATE_SHORT_MIN_CHARS = 8;
const CANDIDATE_LONG_MIN_CHARS = 16;
const SHORT_WORKING_PROSE_FIELDS = new Set<string>(['tagline', 'motto', 'greeting']);

type CandidateBucketUpdate = {
  bucketKey: string;
  operation: ProseCandidateOperation;
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.length > 0;
  if (isPlainRecord(value)) return Object.keys(value).length > 0;
  return false;
}

function mergeUnknown(existing: unknown, incoming: unknown): unknown {
  if (!hasMeaningfulValue(incoming)) return existing;
  if (Array.isArray(incoming)) {
    return incoming.filter((item) => hasMeaningfulValue(item));
  }
  if (isPlainRecord(incoming)) {
    return mergeRecordPreferIncoming(asRecord(existing), incoming);
  }
  return incoming;
}

export function mergeRecordPreferIncoming(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...existing };
  Object.entries(incoming).forEach(([key, value]) => {
    const previous = merged[key];
    const next = mergeUnknown(previous, value);
    if (hasMeaningfulValue(next)) {
      merged[key] = next;
    }
  });
  return merged;
}

function draftArrayKey(value: Record<string, unknown>): string {
  const key = String(value.key || '').trim();
  if (key) return `key:${key}`;
  const id = String(value.id || '').trim();
  if (id) return `id:${id}`;
  const name = String(value.name || '').trim();
  if (name) return `name:${name.toLowerCase()}`;
  return JSON.stringify(value);
}

function mergeDraftArray(
  existing: Array<Record<string, unknown>>,
  incoming: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const byKey = new Map<string, Record<string, unknown>>();
  existing.forEach((item) => {
    const record = asRecord(item);
    byKey.set(draftArrayKey(record), record);
  });
  incoming.forEach((item) => {
    const record = asRecord(item);
    const key = draftArrayKey(record);
    const previous = byKey.get(key);
    byKey.set(key, previous ? mergeRecordPreferIncoming(previous, record) : record);
  });
  return Array.from(byKey.values());
}

function mergeAgentDraft(
  existing: WorldStudioAgentDraft | undefined,
  incoming: WorldStudioAgentDraft,
): WorldStudioAgentDraft {
  if (!existing) {
    return incoming;
  }
  const merged = mergeRecordPreferIncoming(asRecord(existing), asRecord(incoming)) as WorldStudioAgentDraft;
  return {
    ...existing,
    ...merged,
    characterName: incoming.characterName || existing.characterName,
    handle: String(merged.handle || existing.handle || ''),
    concept: String(merged.concept || existing.concept || ''),
    backstory: String(merged.backstory || existing.backstory || ''),
    coreValues: String(merged.coreValues || existing.coreValues || ''),
    relationshipStyle: String(merged.relationshipStyle || existing.relationshipStyle || ''),
  };
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function normalizeCandidateText(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s,.;:!?，。！？；：“”"'`~\-—_()[\]{}<>《》【】、]/g, '');
}

function scoreCandidate(input: {
  content: string;
  confidence: number;
  evidenceRefs: DraftPatchEvidenceRef[];
}): number {
  return (
    (Math.max(0, Math.min(1, input.confidence)) * 100)
    + (input.evidenceRefs.length * 12)
    + Math.min(20, Math.floor(input.content.trim().length / 20))
  );
}

function toWorkingRecord(
  candidate: ProseCandidateDraft,
  chunkIndex: number,
): WorkingProseRecord {
  return {
    content: String(candidate.content || '').trim(),
    confidence: Number.isFinite(candidate.confidence) ? Math.max(0, Math.min(1, candidate.confidence)) : 0.5,
    evidenceRefs: Array.isArray(candidate.evidenceRefs) ? candidate.evidenceRefs : [],
    chunkIndex,
    updatedAt: new Date().toISOString(),
  };
}

function minCharsForField(field: string): number {
  return SHORT_WORKING_PROSE_FIELDS.has(field) ? SHORT_PROSE_MIN_CHARS : LONG_PROSE_MIN_CHARS;
}

function candidateMinCharsForField(field: string): number {
  return SHORT_WORKING_PROSE_FIELDS.has(field) ? CANDIDATE_SHORT_MIN_CHARS : CANDIDATE_LONG_MIN_CHARS;
}

function isWorkingEligible(field: string, record: WorkingProseRecord): boolean {
  return record.confidence >= WORKING_PROSE_CONFIDENCE_MIN
    && record.evidenceRefs.length >= 1
    && record.content.length >= minCharsForField(field);
}

function isCandidateEligible(field: string, record: WorkingProseRecord): boolean {
  return record.evidenceRefs.length >= 1
    && record.content.length >= candidateMinCharsForField(field);
}

function isPrefixOrSuffixExtension(a: string, b: string): boolean {
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (!shorter || !longer || longer === shorter) return false;
  if (!longer.startsWith(shorter) && !longer.endsWith(shorter)) {
    return false;
  }
  return ((longer.length - shorter.length) / shorter.length) <= 0.4;
}

function isSemanticMatch(a: string, b: string): boolean {
  const left = normalizeCandidateText(a);
  const right = normalizeCandidateText(b);
  if (!left || !right) return false;
  return left === right || isPrefixOrSuffixExtension(left, right);
}

function mergeEvidenceRefs(
  existing: DraftPatchEvidenceRef[],
  incoming: DraftPatchEvidenceRef[],
): DraftPatchEvidenceRef[] {
  return mergeDraftArray(
    existing.map((entry) => asRecord(entry)),
    incoming.map((entry) => asRecord(entry)),
  ) as DraftPatchEvidenceRef[];
}

function applyWorkingRecordUpdate(
  existing: WorkingProseRecord | undefined,
  incoming: WorkingProseRecord,
  bucketKey: string,
): {
  next: WorkingProseRecord | undefined;
  operation: CandidateBucketUpdate;
} {
  if (!incoming.content) {
    return {
      next: existing,
      operation: { bucketKey, operation: 'no-op' },
    };
  }
  if (!existing) {
    return {
      next: incoming,
      operation: { bucketKey, operation: 'create' },
    };
  }
  if (isSemanticMatch(existing.content, incoming.content)) {
    return {
      next: {
        ...existing,
        content: incoming.content.length >= existing.content.length ? incoming.content : existing.content,
        confidence: Math.max(existing.confidence, incoming.confidence),
        evidenceRefs: mergeEvidenceRefs(existing.evidenceRefs, incoming.evidenceRefs),
        chunkIndex: incoming.chunkIndex,
        updatedAt: incoming.updatedAt,
      },
      operation: { bucketKey, operation: 'revise' },
    };
  }
  if (scoreCandidate(incoming) > scoreCandidate(existing)) {
    return {
      next: incoming,
      operation: { bucketKey, operation: 'replace' },
    };
  }
  return {
    next: existing,
    operation: { bucketKey, operation: 'no-op' },
  };
}

function resolveSemanticMatchIndex(
  existing: WorkingProseRecord[],
  incoming: WorkingProseRecord,
): number {
  return existing.findIndex((candidate) => isSemanticMatch(candidate.content, incoming.content));
}

function applyCandidateBucketUpdate(
  existing: WorkingProseRecord[],
  incomingDrafts: ProseCandidateDraft[],
  chunkIndex: number,
  bucketKey: string,
): {
  next: WorkingProseRecord[];
  operations: CandidateBucketUpdate[];
} {
  let next = [...existing];
  const operations: CandidateBucketUpdate[] = [];
  incomingDrafts.forEach((draft) => {
    const incoming = toWorkingRecord(draft, chunkIndex);
    if (!incoming.content) {
      operations.push({ bucketKey, operation: 'no-op' });
      return;
    }
    const reviseIndex = resolveSemanticMatchIndex(next, incoming);
    if (reviseIndex >= 0) {
      next = next.map((item, index) => (index === reviseIndex
        ? {
            ...item,
            content: incoming.content.length >= item.content.length ? incoming.content : item.content,
            confidence: Math.max(item.confidence, incoming.confidence),
            evidenceRefs: mergeEvidenceRefs(item.evidenceRefs, incoming.evidenceRefs),
            chunkIndex,
            updatedAt: incoming.updatedAt,
          }
        : item));
      operations.push({ bucketKey, operation: 'revise' });
      return;
    }
    if (next.length < PROSE_CANDIDATE_LIMIT) {
      next = [...next, incoming];
      operations.push({ bucketKey, operation: 'create' });
      return;
    }
    const weakestIndex = next.reduce((bestIndex, candidate, index, array) => (
      scoreCandidate(candidate) < scoreCandidate(array[bestIndex]!)
        ? index
        : bestIndex
    ), 0);
    if (scoreCandidate(incoming) > scoreCandidate(next[weakestIndex]!)) {
      next = next.map((item, index) => (index === weakestIndex ? incoming : item));
      operations.push({ bucketKey, operation: 'replace' });
      return;
    }
    operations.push({ bucketKey, operation: 'no-op' });
  });
  return { next, operations };
}

function cloneAgentFieldRecord<T>(
  input: Record<string, Partial<Record<AgentProseCandidateField, T>>> | undefined,
): Record<string, Partial<Record<AgentProseCandidateField, T>>> {
  return Object.entries(input || {}).reduce<Record<string, Partial<Record<AgentProseCandidateField, T>>>>((acc, [characterName, fields]) => {
    acc[characterName] = { ...(fields || {}) };
    return acc;
  }, {});
}

export function createEmptyFinalDraftAccumulator(): FinalDraftAccumulator {
  return {
    world: {},
    worldview: {},
    worldLorebooks: [],
    futureHistoricalEvents: [],
    agentDraftsByCharacter: {},
    worldWorkingProseByField: {},
    agentWorkingProseByCharacterAndField: {},
    worldProseCandidatesByField: {},
    agentProseCandidatesByCharacterAndField: {},
    evidenceRefs: [],
    revisions: [],
    lastUpdatedChunk: -1,
  };
}

export function buildFinalDraftAccumulatorSlice(
  accumulator: FinalDraftAccumulator,
  options?: {
    maxLorebooks?: number;
    maxFutureEvents?: number;
    maxAgentDrafts?: number;
    maxRevisions?: number;
  },
): Record<string, unknown> {
  const maxLorebooks = Math.max(1, options?.maxLorebooks ?? 10);
  const maxFutureEvents = Math.max(1, options?.maxFutureEvents ?? 10);
  const maxAgentDrafts = Math.max(1, options?.maxAgentDrafts ?? 8);
  const maxRevisions = Math.max(1, options?.maxRevisions ?? 10);
  const agentDrafts = Object.values(accumulator.agentDraftsByCharacter || {})
    .slice(0, maxAgentDrafts);
  return {
    world: accumulator.world || {},
    worldview: accumulator.worldview || {},
    worldProse: accumulator.worldWorkingProseByField || {},
    agentProse: accumulator.agentWorkingProseByCharacterAndField || {},
    worldLorebooks: (accumulator.worldLorebooks || []).slice(0, maxLorebooks),
    futureHistoricalEvents: (accumulator.futureHistoricalEvents || []).slice(0, maxFutureEvents),
    agentDrafts,
    evidenceRefs: (accumulator.evidenceRefs || []).slice(0, 20),
    revisions: (accumulator.revisions || []).slice(-maxRevisions),
    lastUpdatedChunk: accumulator.lastUpdatedChunk,
  };
}

export function applyDraftPatch(
  accumulator: FinalDraftAccumulator,
  patch: DraftPatch,
): {
  next: FinalDraftAccumulator;
  changedFields: string[];
  candidateOps: CandidateBucketUpdate[];
} {
  const changedFields: string[] = [];
  const candidateOps: CandidateBucketUpdate[] = [];

  const alignedWorldPatch = alignWorldPatch(patch.world);
  const nextWorld = Object.keys(alignedWorldPatch).length > 0
    ? mergeRecordPreferIncoming(accumulator.world, alignedWorldPatch)
    : accumulator.world;
  if (!valuesEqual(nextWorld, accumulator.world)) changedFields.push('world');

  const alignedWorldviewPatch = alignWorldviewPatch(patch.worldview);
  const nextWorldview = Object.keys(alignedWorldviewPatch).length > 0
    ? mergeRecordPreferIncoming(accumulator.worldview, alignedWorldviewPatch)
    : accumulator.worldview;
  if (!valuesEqual(nextWorldview, accumulator.worldview)) changedFields.push('worldview');

  const nextWorldLorebooks = Array.isArray(patch.worldLorebooks)
    ? mergeDraftArray(accumulator.worldLorebooks, patch.worldLorebooks.map((item) => asRecord(item)))
    : accumulator.worldLorebooks;
  if (!valuesEqual(nextWorldLorebooks, accumulator.worldLorebooks)) changedFields.push('worldLorebooks');

  const nextFutureEvents = Array.isArray(patch.futureHistoricalEvents)
    ? mergeDraftArray(accumulator.futureHistoricalEvents, patch.futureHistoricalEvents.map((item) => asRecord(item)))
    : accumulator.futureHistoricalEvents;
  if (!valuesEqual(nextFutureEvents, accumulator.futureHistoricalEvents)) changedFields.push('futureHistoricalEvents');

  const nextAgentDraftsByCharacter = { ...(accumulator.agentDraftsByCharacter || {}) };
  if (Array.isArray(patch.agentDrafts)) {
    patch.agentDrafts.forEach((draft) => {
      const aligned = alignAgentStructuralDraft(draft);
      const characterName = String(aligned?.characterName || '').trim();
      if (!aligned || !characterName) return;
      const merged = mergeAgentDraft(nextAgentDraftsByCharacter[characterName], aligned);
      if (!valuesEqual(merged, nextAgentDraftsByCharacter[characterName])) {
        nextAgentDraftsByCharacter[characterName] = merged;
        changedFields.push(`agentDraftsByCharacter.${characterName}`);
      }
    });
  }

  const nextWorldWorkingProseByField = {
    ...(accumulator.worldWorkingProseByField || {}),
  };
  const nextAgentWorkingProseByCharacterAndField = cloneAgentFieldRecord(accumulator.agentWorkingProseByCharacterAndField);
  const nextWorldProseCandidatesByField = {
    ...(accumulator.worldProseCandidatesByField || {}),
  };
  const nextAgentProseCandidatesByCharacterAndField = cloneAgentFieldRecord(accumulator.agentProseCandidatesByCharacterAndField);

  const applyWorldProseRouting = (field: WorldProseCandidateField, incomingDraft: ProseCandidateDraft | undefined) => {
    if (!incomingDraft) return;
    const incoming = toWorkingRecord(incomingDraft, patch.chunkIndex);
    const bucketKey = `world.${field}`;
    if (isWorkingEligible(field, incoming)) {
      const result = applyWorkingRecordUpdate(nextWorldWorkingProseByField[field], incoming, `${bucketKey}.working`);
      candidateOps.push(result.operation);
      if (!valuesEqual(result.next, nextWorldWorkingProseByField[field])) {
        if (result.next) {
          nextWorldWorkingProseByField[field] = result.next;
        } else {
          delete nextWorldWorkingProseByField[field];
        }
        changedFields.push(`worldWorkingProseByField.${field}`);
      }
      return;
    }
    if (isCandidateEligible(field, incoming)) {
      const result = applyCandidateBucketUpdate(
        nextWorldProseCandidatesByField[field] || [],
        [incomingDraft],
        patch.chunkIndex,
        `${bucketKey}.candidates`,
      );
      if (!valuesEqual(result.next, nextWorldProseCandidatesByField[field] || [])) {
        nextWorldProseCandidatesByField[field] = result.next;
        changedFields.push(`worldProseCandidatesByField.${field}`);
      }
      candidateOps.push(...result.operations);
      return;
    }
    candidateOps.push({ bucketKey, operation: 'no-op' });
  };

  WORLD_PROSE_FIELDS.forEach((field) => {
    applyWorldProseRouting(field, patch.worldProse?.[field]);
  });

  Object.entries(patch.agentProse || {}).forEach(([characterName, fields]) => {
    const normalizedName = String(characterName || '').trim();
    if (!normalizedName) return;
    const nextWorkingFields = {
      ...(nextAgentWorkingProseByCharacterAndField[normalizedName] || {}),
    };
    const nextCandidateFields = {
      ...(nextAgentProseCandidatesByCharacterAndField[normalizedName] || {}),
    };
    AGENT_PROSE_FIELDS.forEach((field) => {
      const incomingDraft = fields?.[field];
      if (!incomingDraft) return;
      const incoming = toWorkingRecord(incomingDraft, patch.chunkIndex);
      const bucketKey = `agent.${normalizedName}.${field}`;
      if (isWorkingEligible(field, incoming)) {
        const result = applyWorkingRecordUpdate(nextWorkingFields[field], incoming, `${bucketKey}.working`);
        candidateOps.push(result.operation);
        if (!valuesEqual(result.next, nextWorkingFields[field])) {
          if (result.next) {
            nextWorkingFields[field] = result.next;
          } else {
            delete nextWorkingFields[field];
          }
          changedFields.push(`agentWorkingProseByCharacterAndField.${normalizedName}.${field}`);
        }
        return;
      }
      if (isCandidateEligible(field, incoming)) {
        const result = applyCandidateBucketUpdate(
          nextCandidateFields[field] || [],
          [incomingDraft],
          patch.chunkIndex,
          `${bucketKey}.candidates`,
        );
        if (!valuesEqual(result.next, nextCandidateFields[field] || [])) {
          nextCandidateFields[field] = result.next;
          changedFields.push(`agentProseCandidatesByCharacterAndField.${normalizedName}.${field}`);
        }
        candidateOps.push(...result.operations);
        return;
      }
      candidateOps.push({ bucketKey, operation: 'no-op' });
    });
    nextAgentWorkingProseByCharacterAndField[normalizedName] = nextWorkingFields;
    nextAgentProseCandidatesByCharacterAndField[normalizedName] = nextCandidateFields;
  });

  const nextEvidenceRefs = Array.isArray(patch.evidenceRefs)
    ? mergeDraftArray(
        accumulator.evidenceRefs.map((entry) => asRecord(entry)),
        patch.evidenceRefs.map((entry) => asRecord(entry)),
      ) as DraftPatchEvidenceRef[]
    : accumulator.evidenceRefs;
  if (!valuesEqual(nextEvidenceRefs, accumulator.evidenceRefs)) changedFields.push('evidenceRefs');

  const nextRevisions = (changedFields.length > 0 || candidateOps.length > 0)
    ? [
        ...accumulator.revisions,
        {
          chunkIndex: patch.chunkIndex,
          appliedAt: new Date().toISOString(),
          changedFields: Array.from(new Set(changedFields)),
          ...(candidateOps.length > 0
            ? {
                candidateOps: candidateOps.map((item) => `${item.bucketKey}:${item.operation}`),
              }
            : {}),
          ...(Array.isArray(patch.notes) && patch.notes.length > 0
            ? { note: String(patch.notes[0] || '').trim() }
            : {}),
        },
      ].slice(-REVISION_LIMIT)
    : accumulator.revisions;

  const next: FinalDraftAccumulator = {
    world: nextWorld,
    worldview: nextWorldview,
    worldLorebooks: nextWorldLorebooks,
    futureHistoricalEvents: nextFutureEvents,
    agentDraftsByCharacter: nextAgentDraftsByCharacter,
    worldWorkingProseByField: nextWorldWorkingProseByField,
    agentWorkingProseByCharacterAndField: nextAgentWorkingProseByCharacterAndField,
    worldProseCandidatesByField: nextWorldProseCandidatesByField,
    agentProseCandidatesByCharacterAndField: nextAgentProseCandidatesByCharacterAndField,
    evidenceRefs: nextEvidenceRefs,
    revisions: nextRevisions,
    lastUpdatedChunk: (changedFields.length > 0 || candidateOps.length > 0)
      ? Math.max(accumulator.lastUpdatedChunk, patch.chunkIndex)
      : accumulator.lastUpdatedChunk,
  };
  return {
    next,
    changedFields: Array.from(new Set(changedFields)),
    candidateOps,
  };
}

export function resolveAccumulatorAgentDrafts(
  accumulator: FinalDraftAccumulator,
  selectedCharacters: string[],
): WorldStudioAgentDraft[] {
  const byCharacter = accumulator.agentDraftsByCharacter || {};
  return selectedCharacters
    .map((name) => String(name || '').trim())
    .filter(Boolean)
    .map((name) => byCharacter[name])
    .filter((draft): draft is WorldStudioAgentDraft => Boolean(draft));
}
