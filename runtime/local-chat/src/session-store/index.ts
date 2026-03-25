import type {
  ChatMessage,
  ChatMessageMeta,
  LocalChatCachedMediaArtifact,
  LocalChatMediaArtifactShadow,
  LocalChatMediaGenerationSpec,
} from '../types.js';
import type {
  DerivedInteractionProfile,
  FirstBeatResult,
  InteractionBeat,
  InteractionRecallDoc,
  InteractionSnapshot,
  InteractionTurnPlan,
  LocalChatContextLaneId,
  LocalChatContextRecentTurn,
  LocalChatContextPacket,
  LocalChatContextTrace,
  LocalChatConversationRecord,
  LocalChatPlatformWarmStartMemory,
  LocalChatPromptLaneBudget,
  LocalChatPromptTrace,
  LocalChatReplyPacingPlan,
  LocalChatReplyStyleProfile,
  LocalChatTurnSendPhase,
  LocalChatStoredBeat,
  LocalChatMediaArtifactRecord,
  LocalChatSession,
  LocalChatTurn,
  LocalChatTurnAudit,
  LocalChatTurnRecord,
  LocalChatTurnWithBeats,
  RelationMemorySlot,
  VoiceConversationMode,
} from '../state/ledger-types.js';
import { createUlid } from '../utils/ulid.js';

import {
  nowIso,
  trimString,
  asIsoString,
  normalizeConversationRecord,
  normalizeTurnRecord,
  normalizeBeatRecord,
  normalizeInteractionSnapshot,
  normalizeRelationMemorySlot,
  normalizeInteractionRecallDoc,
  normalizeMediaArtifactRecord,
  normalizeCachedMediaArtifact,
  normalizeMediaSpec,
  normalizeMediaShadow,
  cloneConversation,
  cloneTurnRecord,
  cloneStoredBeat,
  cloneInteractionSnapshot,
  cloneRelationMemorySlot,
  cloneInteractionRecallDoc,
  cloneMediaArtifactRecord,
} from './normalizers.js';

import {
  LOCAL_CHAT_SESSION_UPDATED_EVENT,
  STORE_BEATS,
  STORE_CONVERSATIONS,
  STORE_INTERACTION_SNAPSHOTS,
  STORE_MEDIA_ARTIFACTS,
  STORE_RECALL_INDEX,
  STORE_RELATION_MEMORY_SLOTS,
  STORE_TURNS,
  getLedgerCache,
  resetLedgerCache,
  clearLedgerPersistence,
  ensureLedgerHydrated,
  persistMutation,
  emitSessionUpdated,
} from './ledger-db.js';

import {
  lexicalScore,
  findBestRelationMemoryMatch,
  shouldResolveRelationMemorySlot,
  pruneRelationMemorySlots,
  withPreservedOverride,
} from './relation-memory.js';

export type {
  DerivedInteractionProfile,
  FirstBeatResult,
  InteractionBeat,
  InteractionRecallDoc,
  InteractionSnapshot,
  InteractionTurnPlan,
  LocalChatContextLaneId,
  LocalChatContextRecentTurn,
  LocalChatContextPacket,
  LocalChatContextTrace,
  LocalChatConversationRecord,
  LocalChatPlatformWarmStartMemory,
  LocalChatPromptLaneBudget,
  LocalChatPromptTrace,
  LocalChatReplyPacingPlan,
  LocalChatReplyStyleProfile,
  LocalChatTurnSendPhase,
  LocalChatStoredBeat,
  LocalChatMediaArtifactRecord,
  LocalChatSession,
  LocalChatTurn,
  LocalChatTurnAudit,
  LocalChatTurnRecord,
  LocalChatTurnWithBeats,
  RelationMemorySlot,
  VoiceConversationMode,
};

export type LocalChatTargetPreview = {
  targetId: string;
  latestLocalMessage: string | null;
  latestLocalMessageAt: string | null;
};

type CreateConversationInput = {
  targetId: string;
  viewerId: string;
  worldId?: string | null;
  title?: string;
};

type UpsertConversationInput = Partial<LocalChatConversationRecord> & {
  id: string;
  targetId: string;
  viewerId: string;
};

type TurnRecordInsertInput = {
  conversationId: string;
  role: 'user' | 'assistant';
  turnTxnId?: string | null;
  turnId?: string;
  seq?: number;
  createdAt?: string;
  beatCount?: number;
};

type BeatInsertInput = {
  conversationId: string;
  turnId: string;
  role: 'user' | 'assistant';
  kind: LocalChatStoredBeat['kind'];
  content: string;
  contextText: string;
  semanticSummary?: string | null;
  media?: LocalChatStoredBeat['media'];
  timestamp?: string;
  latencyMs?: number;
  meta?: ChatMessageMeta;
  promptTrace?: LocalChatPromptTrace | null;
  audit?: LocalChatTurnAudit | null;
  deliveryStatus?: LocalChatStoredBeat['deliveryStatus'];
  beatId?: string;
  beatIndex?: number;
  beatCount?: number;
  mediaSpec?: LocalChatMediaGenerationSpec;
  mediaShadow?: LocalChatMediaArtifactShadow;
};

const EXACT_HISTORY_TURN_LIMIT = 8;

function matchesViewerId(recordViewerId: string, viewerId?: string): boolean {
  const normalizedViewerId = trimString(viewerId);
  if (!normalizedViewerId) return true;
  return trimString(recordViewerId) === normalizedViewerId;
}

function compareIsoTimestamp(left: string | null | undefined, right: string | null | undefined): number {
  const leftMs = Date.parse(String(left || ''));
  const rightMs = Date.parse(String(right || ''));
  const normalizedLeft = Number.isFinite(leftMs) ? leftMs : 0;
  const normalizedRight = Number.isFinite(rightMs) ? rightMs : 0;
  return normalizedLeft - normalizedRight;
}

function buildConversationScopeKey(targetId: string, viewerId: string): string {
  return `${trimString(viewerId)}::${trimString(targetId)}`;
}

function sortConversationRecords(records: LocalChatConversationRecord[]): LocalChatConversationRecord[] {
  return [...records].sort((left, right) => (
    compareIsoTimestamp(right.updatedAt, left.updatedAt)
    || compareIsoTimestamp(right.createdAt, left.createdAt)
    || left.id.localeCompare(right.id)
  ));
}

function sortTurnRecords(records: LocalChatTurnRecord[]): LocalChatTurnRecord[] {
  return [...records].sort((left, right) => (
    left.seq - right.seq
    || left.createdAt.localeCompare(right.createdAt)
    || left.id.localeCompare(right.id)
  ));
}

function sortStoredBeats(records: LocalChatStoredBeat[]): LocalChatStoredBeat[] {
  return [...records].sort((left, right) => (
    left.turnSeq - right.turnSeq
    || left.beatIndex - right.beatIndex
    || left.timestamp.localeCompare(right.timestamp)
    || left.id.localeCompare(right.id)
  ));
}

function turnsForConversation(conversationId: string): LocalChatTurnRecord[] {
  return sortTurnRecords(
    [...getLedgerCache().turnsById.values()].filter((turn) => turn.conversationId === conversationId),
  );
}

function findConversationForScope(input: {
  targetId: string;
  viewerId: string;
}): LocalChatConversationRecord | null {
  const scopeKey = buildConversationScopeKey(input.targetId, input.viewerId);
  return sortConversationRecords(
    [...getLedgerCache().conversationsById.values()].filter((conversation) => (
      buildConversationScopeKey(conversation.targetId, conversation.viewerId) === scopeKey
    )),
  )[0] || null;
}

function beatsForTurn(turnId: string): LocalChatStoredBeat[] {
  return sortStoredBeats(
    [...getLedgerCache().beatsById.values()].filter((beat) => beat.turnId === turnId),
  );
}

function mediaArtifactsForConversation(conversationId: string): LocalChatMediaArtifactRecord[] {
  return [...getLedgerCache().mediaArtifactsById.values()]
    .filter((artifact) => artifact.conversationId === conversationId)
    .sort((left, right) => (
      compareIsoTimestamp(right.lastHitAt, left.lastHitAt)
      || compareIsoTimestamp(right.createdAt, left.createdAt)
      || left.id.localeCompare(right.id)
    ));
}

function buildTurnWithBeats(turn: LocalChatTurnRecord): LocalChatTurnWithBeats {
  const beats = beatsForTurn(turn.id);
  return {
    ...cloneTurnRecord(turn),
    beats: beats.map((beat) => cloneStoredBeat(beat)),
  };
}

function projectBeatToTurn(turn: LocalChatTurnRecord, beat: LocalChatStoredBeat): LocalChatTurn {
  return {
    id: beat.id,
    turnId: turn.id,
    turnSeq: turn.seq,
    beatIndex: beat.beatIndex,
    beatCount: Math.max(turn.beatCount, beat.beatCount, beat.beatIndex + 1),
    role: beat.role,
    kind: beat.kind,
    content: beat.content,
    contextText: beat.contextText,
    semanticSummary: beat.semanticSummary,
    mediaSpec: beat.mediaSpec,
    mediaShadow: beat.mediaShadow,
    media: beat.media,
    timestamp: beat.timestamp,
    latencyMs: beat.latencyMs,
    meta: beat.meta,
    promptTrace: beat.promptTrace,
    audit: beat.audit,
  };
}

function projectConversationToSession(record: LocalChatConversationRecord): LocalChatSession {
  const groupedTurns = turnsForConversation(record.id)
    .map((turn) => buildTurnWithBeats(turn))
    .filter((turn) => turn.beats.length > 0);
  const turns = groupedTurns.flatMap((turn) => (
    turn.beats.map((beat) => projectBeatToTurn(turn, beat))
  ));
  return {
    id: record.id,
    targetId: record.targetId,
    viewerId: record.viewerId,
    worldId: record.worldId,
    title: record.title,
    turns,
    turnCount: groupedTurns.length,
    messageCount: turns.length,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function latestTraceFromSession(session: LocalChatSession | null): LocalChatPromptTrace | null {
  if (!session) return null;
  for (let index = session.turns.length - 1; index >= 0; index -= 1) {
    const turn = session.turns[index];
    if (!turn || turn.role !== 'assistant') continue;
    if (turn.promptTrace) return turn.promptTrace;
  }
  return null;
}

function latestAuditFromSession(session: LocalChatSession | null): LocalChatTurnAudit | null {
  if (!session) return null;
  for (let index = session.turns.length - 1; index >= 0; index -= 1) {
    const turn = session.turns[index];
    if (!turn || turn.role !== 'assistant') continue;
    if (turn.audit) return turn.audit;
  }
  return null;
}

function createProjectionTurnFromMessage(
  message: ChatMessage,
  promptTrace?: LocalChatPromptTrace | null,
  audit?: LocalChatTurnAudit | null,
): LocalChatTurn {
  const metaTurnId = trimString(message.meta?.turnId);
  const beatIndex = Number.isFinite(message.meta?.beatIndex) ? Math.max(0, Number(message.meta?.beatIndex)) : 0;
  const beatCount = Number.isFinite(message.meta?.beatCount) && Number(message.meta?.beatCount) > 0
    ? Math.floor(Number(message.meta?.beatCount))
    : 1;
  return {
    id: message.id,
    turnId: metaTurnId || message.id,
    turnSeq: 0,
    beatIndex,
    beatCount,
    role: message.role,
    kind: message.kind === 'voice' || message.kind === 'image' || message.kind === 'video'
      ? message.kind
      : 'text',
    content: message.content,
    contextText: message.content,
    semanticSummary: null,
    mediaSpec: message.meta?.mediaSpec,
    mediaShadow: message.meta?.mediaShadow,
    media: message.media,
    timestamp: message.timestamp.toISOString(),
    latencyMs: message.latencyMs,
    meta: message.meta,
    promptTrace: promptTrace || undefined,
    audit: audit || undefined,
  };
}

function buildProjectionSession(session: LocalChatSession): LocalChatSession {
  return {
    ...session,
    turns: [...session.turns],
  };
}

export function isSyncableRelationMemorySlot(slot: Pick<RelationMemorySlot, 'portability' | 'sensitivity' | 'userOverride'>): boolean {
  return slot.portability === 'portable'
    && slot.sensitivity !== 'intimate'
    && slot.userOverride !== 'never-sync';
}

export function getLocalChatSessionUpdatedEventName(): string {
  return LOCAL_CHAT_SESSION_UPDATED_EVENT;
}

export function warmUpLedgerHydration(): void {
  void ensureLedgerHydrated();
}

export async function resetLocalChatConversationLedgerForTests(): Promise<void> {
  resetLedgerCache();
  await clearLedgerPersistence();
}

export async function listLocalChatSessions(targetId: string, viewerId?: string): Promise<LocalChatSession[]> {
  await ensureLedgerHydrated();
  const normalizedTargetId = trimString(targetId);
  if (!normalizedTargetId) return [];
  const normalizedViewerId = trimString(viewerId);
  if (normalizedViewerId) {
    const scopedConversation = findConversationForScope({
      targetId: normalizedTargetId,
      viewerId: normalizedViewerId,
    });
    return scopedConversation
      ? [buildProjectionSession(projectConversationToSession(scopedConversation))]
      : [];
  }
  return [...getLedgerCache().conversationsById.values()]
    .filter((conversation) => (
      conversation.targetId === normalizedTargetId
      && matchesViewerId(conversation.viewerId, viewerId)
    ))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((conversation) => buildProjectionSession(projectConversationToSession(conversation)));
}

export async function listLocalChatTargetPreviews(viewerId?: string): Promise<LocalChatTargetPreview[]> {
  await ensureLedgerHydrated();
  const previews = (await listAllLocalChatSessions(viewerId))
    .map((session) => {
      const latestTurn = session.turns[session.turns.length - 1];
      return {
        targetId: session.targetId,
        latestLocalMessage: latestTurn?.contextText || latestTurn?.content || null,
        latestLocalMessageAt: latestTurn?.timestamp || session.updatedAt || null,
      };
    });
  const latestByTargetId = new Map<string, LocalChatTargetPreview>();
  for (const preview of previews) {
    const previous = latestByTargetId.get(preview.targetId);
    if (!previous || compareIsoTimestamp(previous.latestLocalMessageAt, preview.latestLocalMessageAt) < 0) {
      latestByTargetId.set(preview.targetId, preview);
    }
  }
  return [...latestByTargetId.values()].sort((left, right) => (
    compareIsoTimestamp(right.latestLocalMessageAt, left.latestLocalMessageAt)
    || left.targetId.localeCompare(right.targetId)
  ));
}

export async function listAllLocalChatSessions(viewerId?: string): Promise<LocalChatSession[]> {
  await ensureLedgerHydrated();
  return [...getLedgerCache().conversationsById.values()]
    .filter((conversation) => matchesViewerId(conversation.viewerId, viewerId))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((conversation) => buildProjectionSession(projectConversationToSession(conversation)));
}

export async function getLocalChatSession(sessionId: string, viewerId?: string): Promise<LocalChatSession | null> {
  await ensureLedgerHydrated();
  const conversation = getLedgerCache().conversationsById.get(trimString(sessionId));
  if (!conversation || !matchesViewerId(conversation.viewerId, viewerId)) return null;
  return buildProjectionSession(projectConversationToSession(conversation));
}

export async function getLocalChatConversationRecord(sessionId: string, viewerId?: string): Promise<LocalChatConversationRecord | null> {
  await ensureLedgerHydrated();
  const conversation = getLedgerCache().conversationsById.get(trimString(sessionId));
  if (!conversation || !matchesViewerId(conversation.viewerId, viewerId)) return null;
  return cloneConversation(conversation);
}

export async function listLocalChatTurnRecords(conversationId: string, viewerId?: string): Promise<LocalChatTurnWithBeats[]> {
  await ensureLedgerHydrated();
  const conversation = getLedgerCache().conversationsById.get(trimString(conversationId));
  if (!conversation || !matchesViewerId(conversation.viewerId, viewerId)) return [];
  return turnsForConversation(conversation.id).map((turn) => buildTurnWithBeats(turn));
}

export async function listLocalChatExactHistoryTurns(conversationId: string, viewerId?: string): Promise<LocalChatTurn[]> {
  const turns = await listLocalChatTurnRecords(conversationId, viewerId);
  return turns
    .filter((turn) => turn.beats.length > 0)
    .slice(-EXACT_HISTORY_TURN_LIMIT)
    .flatMap((turn) => turn.beats.map((beat) => projectBeatToTurn(turn, beat)));
}

export async function createLocalChatSession(input: CreateConversationInput): Promise<LocalChatSession> {
  await ensureLedgerHydrated();
  const targetId = trimString(input.targetId);
  const viewerId = trimString(input.viewerId) || 'viewer';
  const existing = findConversationForScope({
    targetId,
    viewerId,
  });
  if (existing) {
    return buildProjectionSession(projectConversationToSession(existing));
  }
  const createdAt = nowIso();
  const conversation: LocalChatConversationRecord = {
    id: `conv_${createUlid()}`,
    targetId,
    viewerId,
    worldId: trimString(input.worldId) || null,
    title: trimString(input.title) || 'Session',
    createdAt,
    updatedAt: createdAt,
    lastTurnSeq: 0,
  };
  getLedgerCache().conversationsById.set(conversation.id, conversation);
  await persistMutation({
    puts: {
      [STORE_CONVERSATIONS]: [conversation],
    },
  });
  emitSessionUpdated({
    targetId: conversation.targetId,
    sessionId: conversation.id,
  });
  return projectConversationToSession(conversation);
}

export async function upsertLocalChatSession(session: UpsertConversationInput | LocalChatSession): Promise<LocalChatSession> {
  await ensureLedgerHydrated();
  const requestedId = trimString(session.id);
  const targetId = trimString(session.targetId);
  const viewerId = trimString(session.viewerId) || 'viewer';
  const existing = getLedgerCache().conversationsById.get(requestedId);
  const scopedExisting = targetId
    ? findConversationForScope({
      targetId,
      viewerId,
    })
    : null;
  const base = scopedExisting || existing || null;
  const createdAt = base?.createdAt || nowIso();
  const next: LocalChatConversationRecord = {
    id: scopedExisting?.id || requestedId,
    targetId: targetId || base?.targetId || '',
    viewerId: viewerId || base?.viewerId || 'viewer',
    worldId: trimString(session.worldId) || base?.worldId || null,
    title: trimString(session.title) || base?.title || 'Session',
    createdAt,
    updatedAt: nowIso(),
    lastTurnSeq: base?.lastTurnSeq || 0,
  };
  getLedgerCache().conversationsById.set(next.id, next);
  await persistMutation({
    puts: {
      [STORE_CONVERSATIONS]: [next],
    },
  });
  emitSessionUpdated({
    targetId: next.targetId,
    sessionId: next.id,
  });
  return projectConversationToSession(next);
}

export async function deleteLocalChatSession(sessionId: string): Promise<void> {
  await ensureLedgerHydrated();
  const ledgerCache = getLedgerCache();
  const conversation = ledgerCache.conversationsById.get(trimString(sessionId));
  if (!conversation) return;
  ledgerCache.conversationsById.delete(conversation.id);

  const turnIds = turnsForConversation(conversation.id).map((turn) => turn.id);
  const beatIds = [...ledgerCache.beatsById.values()]
    .filter((beat) => beat.conversationId === conversation.id)
    .map((beat) => beat.id);
  const mediaArtifactIds = [...ledgerCache.mediaArtifactsById.values()]
    .filter((artifact) => artifact.conversationId === conversation.id)
    .map((artifact) => artifact.id);
  const recallIndexIds = [...ledgerCache.recallIndexById.values()]
    .filter((doc) => doc.conversationId === conversation.id)
    .map((doc) => doc.id);

  turnIds.forEach((turnId) => ledgerCache.turnsById.delete(turnId));
  beatIds.forEach((beatId) => ledgerCache.beatsById.delete(beatId));
  mediaArtifactIds.forEach((artifactId) => ledgerCache.mediaArtifactsById.delete(artifactId));
  ledgerCache.interactionSnapshotsByConversationId.delete(conversation.id);
  recallIndexIds.forEach((docId) => ledgerCache.recallIndexById.delete(docId));

  await persistMutation({
    deletes: {
      [STORE_CONVERSATIONS]: [conversation.id],
      [STORE_TURNS]: turnIds,
      [STORE_BEATS]: beatIds,
      [STORE_MEDIA_ARTIFACTS]: mediaArtifactIds,
      [STORE_INTERACTION_SNAPSHOTS]: [conversation.id],
      [STORE_RECALL_INDEX]: recallIndexIds,
    },
  });
  emitSessionUpdated({
    targetId: conversation.targetId,
    sessionId: conversation.id,
  });
}

export async function clearLocalChatSessionHistory(sessionId: string): Promise<void> {
  await ensureLedgerHydrated();
  const ledgerCache = getLedgerCache();
  const conversation = ledgerCache.conversationsById.get(trimString(sessionId));
  if (!conversation) return;

  const turnIds = turnsForConversation(conversation.id).map((turn) => turn.id);
  const beatIds = [...ledgerCache.beatsById.values()]
    .filter((beat) => beat.conversationId === conversation.id)
    .map((beat) => beat.id);
  const mediaArtifactIds = [...ledgerCache.mediaArtifactsById.values()]
    .filter((artifact) => artifact.conversationId === conversation.id)
    .map((artifact) => artifact.id);

  turnIds.forEach((turnId) => ledgerCache.turnsById.delete(turnId));
  beatIds.forEach((beatId) => ledgerCache.beatsById.delete(beatId));
  mediaArtifactIds.forEach((artifactId) => ledgerCache.mediaArtifactsById.delete(artifactId));

  const nextConversation: LocalChatConversationRecord = {
    ...conversation,
    lastTurnSeq: 0,
    updatedAt: nowIso(),
  };
  ledgerCache.conversationsById.set(nextConversation.id, nextConversation);

  await persistMutation({
    puts: {
      [STORE_CONVERSATIONS]: [nextConversation],
    },
    deletes: {
      [STORE_TURNS]: turnIds,
      [STORE_BEATS]: beatIds,
      [STORE_MEDIA_ARTIFACTS]: mediaArtifactIds,
    },
  });
  emitSessionUpdated({
    targetId: nextConversation.targetId,
    sessionId: nextConversation.id,
  });
}

export async function createLocalChatTurnRecord(input: TurnRecordInsertInput): Promise<LocalChatTurnRecord> {
  await ensureLedgerHydrated();
  const ledgerCache = getLedgerCache();
  const conversation = ledgerCache.conversationsById.get(trimString(input.conversationId));
  if (!conversation) {
    throw new Error('LOCAL_CHAT_CONVERSATION_NOT_FOUND');
  }
  const createdAt = asIsoString(input.createdAt, nowIso());
  const seq = Number.isFinite(input.seq) && Number(input.seq) > 0
    ? Math.floor(Number(input.seq))
    : conversation.lastTurnSeq + 1;
  const turn: LocalChatTurnRecord = {
    id: trimString(input.turnId) || `turn_${createUlid()}`,
    conversationId: conversation.id,
    seq,
    role: input.role,
    turnTxnId: trimString(input.turnTxnId) || null,
    createdAt,
    updatedAt: createdAt,
    beatCount: Number.isFinite(input.beatCount) && Number(input.beatCount) > 0
      ? Math.floor(Number(input.beatCount))
      : 0,
  };
  ledgerCache.turnsById.set(turn.id, turn);
  const nextConversation: LocalChatConversationRecord = {
    ...conversation,
    lastTurnSeq: Math.max(conversation.lastTurnSeq, turn.seq),
    updatedAt: createdAt,
  };
  ledgerCache.conversationsById.set(nextConversation.id, nextConversation);
  await persistMutation({
    puts: {
      [STORE_TURNS]: [turn],
      [STORE_CONVERSATIONS]: [nextConversation],
    },
  });
  emitSessionUpdated({
    targetId: nextConversation.targetId,
    sessionId: nextConversation.id,
  });
  return cloneTurnRecord(turn);
}

export async function appendBeatToLocalChatTurn(input: BeatInsertInput): Promise<LocalChatStoredBeat> {
  await ensureLedgerHydrated();
  const ledgerCache = getLedgerCache();
  const conversation = ledgerCache.conversationsById.get(trimString(input.conversationId));
  const turn = ledgerCache.turnsById.get(trimString(input.turnId));
  if (!conversation || !turn || turn.conversationId !== conversation.id) {
    throw new Error('LOCAL_CHAT_TURN_NOT_FOUND');
  }
  const beatId = trimString(input.beatId) || `beat_${createUlid()}`;
  const existingBeat = ledgerCache.beatsById.get(beatId);
  if (existingBeat && existingBeat.turnId !== turn.id) {
    throw new Error('LOCAL_CHAT_BEAT_TURN_MISMATCH');
  }
  const timestamp = asIsoString(input.timestamp, nowIso());
  const priorBeats = beatsForTurn(turn.id);
  const beatIndex = Number.isFinite(input.beatIndex) && Number(input.beatIndex) >= 0
    ? Math.floor(Number(input.beatIndex))
    : existingBeat?.beatIndex ?? priorBeats.length;
  const explicitBeatCount = Number.isFinite(input.beatCount) && Number(input.beatCount) > 0
    ? Math.floor(Number(input.beatCount))
    : 0;
  const beatCount = Math.max(
    explicitBeatCount,
    existingBeat?.beatCount || 0,
    turn.beatCount,
    beatIndex + 1,
  ) || 1;

  const beat: LocalChatStoredBeat = {
    id: beatId,
    turnId: turn.id,
    turnSeq: turn.seq,
    conversationId: conversation.id,
    role: input.role,
    beatIndex,
    beatCount,
    kind: input.kind,
    deliveryStatus: input.deliveryStatus || existingBeat?.deliveryStatus || 'ready',
    content: String(input.content || ''),
    contextText: String(input.contextText || input.content || ''),
    semanticSummary: trimString(input.semanticSummary) || null,
    mediaSpec: input.mediaSpec === undefined ? existingBeat?.mediaSpec : input.mediaSpec,
    mediaShadow: input.mediaShadow === undefined ? existingBeat?.mediaShadow : input.mediaShadow,
    media: input.media === undefined ? existingBeat?.media : input.media,
    timestamp,
    latencyMs: input.latencyMs === undefined ? existingBeat?.latencyMs : input.latencyMs,
    meta: input.meta === undefined ? existingBeat?.meta : input.meta,
    promptTrace: input.promptTrace === undefined ? existingBeat?.promptTrace : (input.promptTrace || undefined),
    audit: input.audit === undefined ? existingBeat?.audit : (input.audit || undefined),
  };

  const nextTurn: LocalChatTurnRecord = {
    ...turn,
    updatedAt: timestamp,
    beatCount: Math.max(turn.beatCount, beatCount),
  };
  const nextConversation: LocalChatConversationRecord = {
    ...conversation,
    updatedAt: timestamp,
    lastTurnSeq: Math.max(conversation.lastTurnSeq, turn.seq),
  };

  ledgerCache.beatsById.set(beat.id, beat);
  ledgerCache.turnsById.set(nextTurn.id, nextTurn);
  ledgerCache.conversationsById.set(nextConversation.id, nextConversation);
  await persistMutation({
    puts: {
      [STORE_BEATS]: [beat],
      [STORE_TURNS]: [nextTurn],
      [STORE_CONVERSATIONS]: [nextConversation],
    },
  });
  emitSessionUpdated({
    targetId: nextConversation.targetId,
    sessionId: nextConversation.id,
  });
  return cloneStoredBeat(beat);
}

export async function patchLocalChatBeatArtifacts(input: {
  sessionId: string;
  beatId: string;
  promptTrace?: LocalChatPromptTrace | null;
  audit?: LocalChatTurnAudit | null;
  contextText?: string;
  semanticSummary?: string | null;
  deliveryStatus?: LocalChatStoredBeat['deliveryStatus'];
  media?: LocalChatStoredBeat['media'];
  meta?: ChatMessageMeta;
  mediaSpec?: LocalChatMediaGenerationSpec;
  mediaShadow?: LocalChatMediaArtifactShadow;
}): Promise<LocalChatSession | null> {
  await ensureLedgerHydrated();
  const ledgerCache = getLedgerCache();
  const conversation = ledgerCache.conversationsById.get(trimString(input.sessionId));
  const beat = ledgerCache.beatsById.get(trimString(input.beatId));
  if (!conversation || !beat || beat.conversationId !== conversation.id) return null;
  const nextBeat: LocalChatStoredBeat = {
    ...beat,
    promptTrace: input.promptTrace === undefined ? beat.promptTrace : (input.promptTrace || undefined),
    audit: input.audit === undefined ? beat.audit : (input.audit || undefined),
    contextText: input.contextText === undefined ? beat.contextText : input.contextText,
    semanticSummary: input.semanticSummary === undefined ? beat.semanticSummary : (input.semanticSummary || null),
    deliveryStatus: input.deliveryStatus || beat.deliveryStatus,
    mediaSpec: input.mediaSpec === undefined ? beat.mediaSpec : input.mediaSpec,
    mediaShadow: input.mediaShadow === undefined ? beat.mediaShadow : input.mediaShadow,
    media: input.media === undefined ? beat.media : input.media,
    meta: input.meta === undefined ? beat.meta : input.meta,
  };
  const turn = ledgerCache.turnsById.get(beat.turnId);
  const timestamp = nowIso();
  const nextTurn = turn ? {
    ...turn,
    updatedAt: timestamp,
  } : null;
  const nextConversation: LocalChatConversationRecord = {
    ...conversation,
    updatedAt: timestamp,
  };

  ledgerCache.beatsById.set(nextBeat.id, nextBeat);
  if (nextTurn) {
    ledgerCache.turnsById.set(nextTurn.id, nextTurn);
  }
  ledgerCache.conversationsById.set(nextConversation.id, nextConversation);
  await persistMutation({
    puts: {
      [STORE_BEATS]: [nextBeat],
      ...(nextTurn ? { [STORE_TURNS]: [nextTurn] } : {}),
      [STORE_CONVERSATIONS]: [nextConversation],
    },
  });
  emitSessionUpdated({
    targetId: nextConversation.targetId,
    sessionId: nextConversation.id,
  });
  return projectConversationToSession(nextConversation);
}

export async function appendTurnsToSession(sessionId: string, turns: LocalChatTurn[]): Promise<LocalChatSession | null> {
  await ensureLedgerHydrated();
  const conversation = getLedgerCache().conversationsById.get(trimString(sessionId));
  if (!conversation) return null;
  const grouped = new Map<string, LocalChatTurn[]>();
  for (const turn of turns) {
    const key = trimString(turn.turnId) || trimString(turn.id);
    const bucket = grouped.get(key);
    if (bucket) {
      bucket.push(turn);
    } else {
      grouped.set(key, [turn]);
    }
  }
  let currentConversation = conversation;
  for (const group of [...grouped.values()].sort((left, right) => {
    const leftSeq = left[0]?.turnSeq || 0;
    const rightSeq = right[0]?.turnSeq || 0;
    return leftSeq - rightSeq || String(left[0]?.timestamp || '').localeCompare(String(right[0]?.timestamp || ''));
  })) {
    const lead = group[0];
    if (!lead) continue;
    const turnRecord = await createLocalChatTurnRecord({
      conversationId: currentConversation.id,
      role: lead.role,
      turnTxnId: null,
      turnId: lead.turnId || lead.id,
      seq: lead.turnSeq > 0 ? lead.turnSeq : undefined,
      createdAt: lead.timestamp,
      beatCount: Math.max(...group.map((item) => item.beatCount || 1), 1),
    });
    const orderedBeats = [...group].sort((left, right) => (
      left.beatIndex - right.beatIndex
      || left.timestamp.localeCompare(right.timestamp)
      || left.id.localeCompare(right.id)
    ));
    for (const beat of orderedBeats) {
      await appendBeatToLocalChatTurn({
        conversationId: currentConversation.id,
        turnId: turnRecord.id,
        role: beat.role,
        kind: beat.kind,
        content: beat.content,
        contextText: beat.contextText || beat.content,
        semanticSummary: beat.semanticSummary || null,
        mediaSpec: beat.mediaSpec,
        mediaShadow: beat.mediaShadow,
        media: beat.media,
        timestamp: beat.timestamp,
        latencyMs: beat.latencyMs,
        meta: beat.meta,
        promptTrace: beat.promptTrace || null,
        audit: beat.audit || null,
        deliveryStatus: beat.meta?.mediaStatus === 'pending'
          ? 'pending'
          : beat.meta?.mediaStatus === 'failed'
            ? 'failed'
            : beat.meta?.mediaStatus === 'blocked'
              ? 'blocked'
              : 'ready',
        beatId: beat.id,
        beatIndex: beat.beatIndex,
        beatCount: beat.beatCount,
      });
    }
    currentConversation = getLedgerCache().conversationsById.get(currentConversation.id)!;
  }
  return projectConversationToSession(currentConversation);
}

export async function updateLocalChatTurnArtifacts(input: {
  sessionId: string;
  turnId: string;
  promptTrace?: LocalChatPromptTrace | null;
  audit?: LocalChatTurnAudit | null;
}): Promise<LocalChatSession | null> {
  return patchLocalChatBeatArtifacts({
    sessionId: input.sessionId,
    beatId: input.turnId,
    promptTrace: input.promptTrace,
    audit: input.audit,
  });
}

export async function listLocalChatMediaArtifacts(input: {
  conversationId?: string;
  turnId?: string;
  beatId?: string;
} = {}): Promise<LocalChatMediaArtifactRecord[]> {
  await ensureLedgerHydrated();
  return [...getLedgerCache().mediaArtifactsById.values()]
    .filter((artifact) => (
      (!input.conversationId || artifact.conversationId === trimString(input.conversationId))
      && (!input.turnId || artifact.turnId === trimString(input.turnId))
      && (!input.beatId || artifact.beatId === trimString(input.beatId))
    ))
    .sort((left, right) => (
      compareIsoTimestamp(right.lastHitAt, left.lastHitAt)
      || compareIsoTimestamp(right.createdAt, left.createdAt)
      || left.id.localeCompare(right.id)
    ))
    .map((artifact) => cloneMediaArtifactRecord(artifact));
}

export async function upsertLocalChatMediaArtifactRecord(artifact: LocalChatMediaArtifactRecord): Promise<LocalChatMediaArtifactRecord> {
  await ensureLedgerHydrated();
  const normalized = normalizeMediaArtifactRecord(artifact);
  if (!normalized) {
    throw new Error('LOCAL_CHAT_MEDIA_ARTIFACT_INVALID');
  }
  getLedgerCache().mediaArtifactsById.set(normalized.id, normalized);
  await persistMutation({
    puts: {
      [STORE_MEDIA_ARTIFACTS]: [normalized],
    },
  });
  return cloneMediaArtifactRecord(normalized);
}

export async function getLocalChatCachedMediaArtifact(executionCacheKey: string): Promise<LocalChatCachedMediaArtifact | null> {
  await ensureLedgerHydrated();
  const normalizedKey = trimString(executionCacheKey);
  if (!normalizedKey) return null;
  const record = [...getLedgerCache().mediaArtifactsById.values()]
    .filter((artifact) => artifact.executionCacheKey === normalizedKey)
    .sort((left, right) => (
      compareIsoTimestamp(right.lastHitAt, left.lastHitAt)
      || compareIsoTimestamp(right.createdAt, left.createdAt)
      || left.id.localeCompare(right.id)
    ))[0];
  if (!record) return null;
  return {
    executionCacheKey: record.executionCacheKey,
    specHash: record.specHash,
    kind: record.kind,
    renderUri: record.renderUri,
    mimeType: record.mimeType,
    routeSource: record.routeSource,
    ...(record.connectorId ? { connectorId: record.connectorId } : {}),
    ...(record.model ? { model: record.model } : {}),
    createdAt: record.createdAt,
    lastHitAt: record.lastHitAt,
  };
}

export async function putLocalChatCachedMediaArtifact(artifact: LocalChatCachedMediaArtifact): Promise<LocalChatCachedMediaArtifact> {
  await ensureLedgerHydrated();
  const normalized = normalizeCachedMediaArtifact(artifact);
  if (!normalized) {
    throw new Error('LOCAL_CHAT_MEDIA_CACHE_INVALID_ARTIFACT');
  }
  const record: LocalChatMediaArtifactRecord = {
    ...normalized,
    id: `artifact_${createUlid()}`,
    conversationId: null,
    turnId: null,
    beatId: null,
  };
  getLedgerCache().mediaArtifactsById.set(record.id, record);
  await persistMutation({
    puts: {
      [STORE_MEDIA_ARTIFACTS]: [record],
    },
  });
  return { ...normalized };
}

export async function getLocalChatInteractionSnapshot(conversationId: string): Promise<InteractionSnapshot | null> {
  await ensureLedgerHydrated();
  const snapshot = getLedgerCache().interactionSnapshotsByConversationId.get(trimString(conversationId));
  return snapshot ? cloneInteractionSnapshot(snapshot) : null;
}

export async function upsertLocalChatInteractionSnapshot(snapshot: InteractionSnapshot): Promise<InteractionSnapshot> {
  await ensureLedgerHydrated();
  const normalized = normalizeInteractionSnapshot(snapshot) || {
    ...snapshot,
    updatedAt: snapshot.updatedAt || nowIso(),
  };
  getLedgerCache().interactionSnapshotsByConversationId.set(normalized.conversationId, normalized);
  await persistMutation({
    puts: {
      [STORE_INTERACTION_SNAPSHOTS]: [normalized],
    },
  });
  return cloneInteractionSnapshot(normalized);
}

export async function listLocalChatRelationMemorySlots(input: {
  targetId: string;
  viewerId: string;
}): Promise<RelationMemorySlot[]> {
  await ensureLedgerHydrated();
  return [...getLedgerCache().relationMemorySlotsById.values()]
    .filter((entry) => (
      entry.targetId === trimString(input.targetId)
      && entry.viewerId === trimString(input.viewerId)
    ))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((entry) => cloneRelationMemorySlot(entry));
}

export async function replaceLocalChatRelationMemorySlots(input: {
  targetId: string;
  viewerId: string;
  entries: RelationMemorySlot[];
}): Promise<void> {
  await ensureLedgerHydrated();
  const ledgerCache = getLedgerCache();
  const targetId = trimString(input.targetId);
  const viewerId = trimString(input.viewerId);
  const deleted: string[] = [];
  const preservedOverrideById = new Map<string, RelationMemorySlot['userOverride']>();
  for (const [id, slot] of ledgerCache.relationMemorySlotsById.entries()) {
    if (slot.targetId !== targetId || slot.viewerId !== viewerId) continue;
    preservedOverrideById.set(slot.id, slot.userOverride);
    ledgerCache.relationMemorySlotsById.delete(id);
    deleted.push(id);
  }
  const normalized = input.entries
    .map((entry) => normalizeRelationMemorySlot(entry))
    .filter((entry): entry is RelationMemorySlot => Boolean(entry));
  normalized.forEach((entry) => {
    const preservedOverride = preservedOverrideById.get(entry.id);
    const nextEntry = preservedOverride && entry.userOverride === 'inherit'
      ? {
        ...entry,
        userOverride: preservedOverride,
      }
      : entry;
    ledgerCache.relationMemorySlotsById.set(nextEntry.id, nextEntry);
  });
  await persistMutation({
    puts: {
      [STORE_RELATION_MEMORY_SLOTS]: normalized.map((entry) => {
        const preservedOverride = preservedOverrideById.get(entry.id);
        return preservedOverride && entry.userOverride === 'inherit'
          ? {
            ...entry,
            userOverride: preservedOverride,
          }
          : entry;
      }),
    },
    deletes: {
      [STORE_RELATION_MEMORY_SLOTS]: deleted,
    },
  });
}

export async function mergeLocalChatRelationMemorySlots(input: {
  targetId: string;
  viewerId: string;
  entries: RelationMemorySlot[];
  resolutionTexts?: string[];
  maxEntries?: number;
}): Promise<RelationMemorySlot[]> {
  await ensureLedgerHydrated();
  const ledgerCache = getLedgerCache();
  const targetId = trimString(input.targetId);
  const viewerId = trimString(input.viewerId);
  const normalizedEntries = input.entries
    .map((entry) => normalizeRelationMemorySlot(entry))
    .filter((entry): entry is RelationMemorySlot => Boolean(entry))
    .filter((entry) => entry.targetId === targetId && entry.viewerId === viewerId);
  const resolutionTexts = (input.resolutionTexts || []).map(trimString).filter(Boolean);
  const maxEntries = Number.isFinite(input.maxEntries) && Number(input.maxEntries) > 0
    ? Math.floor(Number(input.maxEntries))
    : 50;
  const existing = [...ledgerCache.relationMemorySlotsById.values()]
    .filter((entry) => entry.targetId === targetId && entry.viewerId === viewerId)
    .map((entry) => cloneRelationMemorySlot(entry));

  const deletedIds = new Set<string>();
  let merged = existing.filter((entry) => {
    if (!shouldResolveRelationMemorySlot(entry, resolutionTexts)) {
      return true;
    }
    deletedIds.add(entry.id);
    return false;
  });

  const putEntries = new Map<string, RelationMemorySlot>();
  for (const normalizedEntry of normalizedEntries) {
    const matched = findBestRelationMemoryMatch(merged, normalizedEntry);
    if (matched) {
      const nextEntry = withPreservedOverride({
        ...matched,
        ...normalizedEntry,
        id: matched.id,
      }, matched);
      merged = merged.map((entry) => entry.id === matched.id ? nextEntry : entry);
      putEntries.set(nextEntry.id, nextEntry);
      continue;
    }
    const nextEntry = withPreservedOverride({
      ...normalizedEntry,
      id: trimString(normalizedEntry.id) || `slot_${createUlid()}`,
    });
    merged.push(nextEntry);
    putEntries.set(nextEntry.id, nextEntry);
  }

  const { kept, removed } = pruneRelationMemorySlots(merged, maxEntries);
  removed.forEach((entry) => {
    deletedIds.add(entry.id);
    putEntries.delete(entry.id);
  });

  for (const entry of existing) {
    if (deletedIds.has(entry.id)) {
      ledgerCache.relationMemorySlotsById.delete(entry.id);
    }
  }
  kept.forEach((entry) => {
    ledgerCache.relationMemorySlotsById.set(entry.id, entry);
  });

  await persistMutation({
    puts: putEntries.size > 0
      ? {
        [STORE_RELATION_MEMORY_SLOTS]: [...putEntries.values()],
      }
      : undefined,
    deletes: deletedIds.size > 0
      ? {
        [STORE_RELATION_MEMORY_SLOTS]: [...deletedIds],
      }
      : undefined,
  });

  return kept
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((entry) => cloneRelationMemorySlot(entry));
}

export async function updateLocalChatRelationMemorySlot(input: {
  id: string;
  targetId: string;
  viewerId: string;
  updater: (previous: RelationMemorySlot) => RelationMemorySlot;
}): Promise<RelationMemorySlot | null> {
  await ensureLedgerHydrated();
  const ledgerCache = getLedgerCache();
  const existing = ledgerCache.relationMemorySlotsById.get(trimString(input.id));
  if (!existing) {
    return null;
  }
  if (existing.targetId !== trimString(input.targetId) || existing.viewerId !== trimString(input.viewerId)) {
    return null;
  }
  const next = normalizeRelationMemorySlot(input.updater(cloneRelationMemorySlot(existing)));
  if (!next) {
    return null;
  }
  ledgerCache.relationMemorySlotsById.set(next.id, next);
  await persistMutation({
    puts: {
      [STORE_RELATION_MEMORY_SLOTS]: [next],
    },
  });
  return cloneRelationMemorySlot(next);
}

export async function deleteLocalChatRelationMemorySlot(input: {
  id: string;
  targetId: string;
  viewerId: string;
}): Promise<void> {
  await ensureLedgerHydrated();
  const ledgerCache = getLedgerCache();
  const existing = ledgerCache.relationMemorySlotsById.get(trimString(input.id));
  if (!existing) {
    return;
  }
  if (existing.targetId !== trimString(input.targetId) || existing.viewerId !== trimString(input.viewerId)) {
    return;
  }
  ledgerCache.relationMemorySlotsById.delete(existing.id);
  await persistMutation({
    deletes: {
      [STORE_RELATION_MEMORY_SLOTS]: [existing.id],
    },
  });
}

export async function clearLocalChatHiddenMemoryState(input: {
  conversationId: string;
  targetId: string;
  viewerId: string;
}): Promise<void> {
  await ensureLedgerHydrated();
  const ledgerCache = getLedgerCache();
  const conversationId = trimString(input.conversationId);
  const targetId = trimString(input.targetId);
  const viewerId = trimString(input.viewerId);
  if (!conversationId || !targetId || !viewerId) {
    return;
  }

  const deletedSnapshotIds: string[] = [];
  if (ledgerCache.interactionSnapshotsByConversationId.has(conversationId)) {
    ledgerCache.interactionSnapshotsByConversationId.delete(conversationId);
    deletedSnapshotIds.push(conversationId);
  }

  const deletedRelationMemoryIds: string[] = [];
  for (const [id, slot] of ledgerCache.relationMemorySlotsById.entries()) {
    if (slot.targetId !== targetId || slot.viewerId !== viewerId) continue;
    ledgerCache.relationMemorySlotsById.delete(id);
    deletedRelationMemoryIds.push(id);
  }

  const deletedRecallIds: string[] = [];
  for (const [id, doc] of ledgerCache.recallIndexById.entries()) {
    if (doc.conversationId !== conversationId) continue;
    ledgerCache.recallIndexById.delete(id);
    deletedRecallIds.push(id);
  }

  await persistMutation({
    deletes: {
      ...(deletedSnapshotIds.length > 0
        ? {
          [STORE_INTERACTION_SNAPSHOTS]: deletedSnapshotIds,
        }
        : {}),
      ...(deletedRelationMemoryIds.length > 0
        ? {
          [STORE_RELATION_MEMORY_SLOTS]: deletedRelationMemoryIds,
        }
        : {}),
      ...(deletedRecallIds.length > 0
        ? {
          [STORE_RECALL_INDEX]: deletedRecallIds,
        }
        : {}),
    },
  });
  emitSessionUpdated({
    targetId,
    sessionId: conversationId,
  });
}

export async function listLocalChatRecallIndex(conversationId: string): Promise<InteractionRecallDoc[]> {
  await ensureLedgerHydrated();
  return [...getLedgerCache().recallIndexById.values()]
    .filter((doc) => doc.conversationId === trimString(conversationId))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((doc) => cloneInteractionRecallDoc(doc));
}

export async function replaceLocalChatRecallIndex(input: {
  conversationId: string;
  docs: InteractionRecallDoc[];
}): Promise<void> {
  await ensureLedgerHydrated();
  const ledgerCache = getLedgerCache();
  const conversationId = trimString(input.conversationId);
  const deleted: string[] = [];
  for (const [id, doc] of ledgerCache.recallIndexById.entries()) {
    if (doc.conversationId !== conversationId) continue;
    ledgerCache.recallIndexById.delete(id);
    deleted.push(id);
  }
  const normalized = input.docs
    .map((doc) => normalizeInteractionRecallDoc(doc))
    .filter((doc): doc is InteractionRecallDoc => Boolean(doc));
  normalized.forEach((doc) => {
    ledgerCache.recallIndexById.set(doc.id, doc);
  });
  await persistMutation({
    puts: {
      [STORE_RECALL_INDEX]: normalized,
    },
    deletes: {
      [STORE_RECALL_INDEX]: deleted,
    },
  });
}

export async function getLatestLocalChatArtifacts(sessionId: string, viewerId?: string): Promise<{
  promptTrace: LocalChatPromptTrace | null;
  audit: LocalChatTurnAudit | null;
}> {
  const session = await getLocalChatSession(sessionId, viewerId);
  return {
    promptTrace: latestTraceFromSession(session),
    audit: latestAuditFromSession(session),
  };
}

export function createSessionTurn(input: {
  message: ChatMessage;
  promptTrace?: LocalChatPromptTrace | null;
  audit?: LocalChatTurnAudit | null;
}): LocalChatTurn {
  return createProjectionTurnFromMessage(input.message, input.promptTrace, input.audit);
}

export async function searchLocalChatRecallIndex(input: {
  conversationId: string;
  query: string;
  limit?: number;
}): Promise<InteractionRecallDoc[]> {
  const docs = await listLocalChatRecallIndex(input.conversationId);
  const query = trimString(input.query);
  if (!query) return docs.slice(0, input.limit || 8);
  return docs
    .map((doc) => ({
      doc,
      score: lexicalScore(doc.text, query),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => (
      right.score - left.score
      || right.doc.updatedAt.localeCompare(left.doc.updatedAt)
    ))
    .slice(0, input.limit || 8)
    .map((item) => item.doc);
}

export async function listLocalChatConversationMediaArtifacts(conversationId: string): Promise<LocalChatMediaArtifactRecord[]> {
  await ensureLedgerHydrated();
  return mediaArtifactsForConversation(trimString(conversationId)).map((artifact) => cloneMediaArtifactRecord(artifact));
}
