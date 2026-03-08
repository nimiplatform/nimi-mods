import type {
  InteractionBeat,
  InteractionRecallDoc,
  InteractionSnapshot,
  LocalChatMediaAssetRecord,
  LocalChatSession,
  RelationMemorySlot,
} from '../../state/index.js';
import { createUlid } from '../../utils/ulid.js';

function normalizeText(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => normalizeText(value)).filter(Boolean)));
}

function createStableSlotId(input: {
  targetId: string;
  viewerId: string;
  slotType: RelationMemorySlot['slotType'];
  key: string;
}): string {
  const seed = `${input.targetId}|${input.viewerId}|${input.slotType}|${normalizeText(input.key).toLowerCase()}`;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash << 5) - hash + seed.charCodeAt(index)) | 0;
  }
  return `slot_${Math.abs(hash).toString(36)}`;
}

function inferRelationshipState(beats: InteractionBeat[]): InteractionSnapshot['relationshipState'] {
  const joined = beats.map((beat) => beat.relationMove).join(' ');
  if (/kiss|hug|closer|暧昧|亲密|依赖|撒娇/u.test(joined)) return 'intimate';
  if (/warm|comfort|陪伴|温柔|抱抱/u.test(joined)) return 'warm';
  if (/friend|轻松|闲聊|日常/u.test(joined)) return 'friendly';
  return 'new';
}

export function compileInteractionState(input: {
  conversationId: string;
  targetId: string;
  viewerId: string;
  session: LocalChatSession | null;
  deliveredBeats: InteractionBeat[];
  mediaAssets?: LocalChatMediaAssetRecord[];
  conversationDirective?: string | null;
}): {
  snapshot: InteractionSnapshot;
  relationMemorySlots: RelationMemorySlot[];
  recallDocs: InteractionRecallDoc[];
} {
  const deliveredBeats = input.deliveredBeats || [];
  const mediaAssets = input.mediaAssets || [];
  const texts = deliveredBeats.map((beat) => normalizeText(beat.text)).filter(Boolean);
  const mediaTexts = mediaAssets
    .map((asset) => normalizeText(`${asset.kind} ${asset.model || ''} ${asset.renderUri}`))
    .filter(Boolean);
  const sceneMoves = dedupe(deliveredBeats.map((beat) => beat.sceneMove));
  const relationMoves = dedupe(deliveredBeats.map((beat) => beat.relationMove));
  const lastTurnId = deliveredBeats[deliveredBeats.length - 1]?.turnId || null;
  const historyTexts = (input.session?.turns || [])
    .slice(-10)
    .map((turn) => normalizeText(turn.contextText || turn.content))
    .filter(Boolean);
  const openLoops = dedupe([
    ...texts.filter((text) => /之后|待会|回头|下次|记得|稍后|再来/u.test(text)),
    ...historyTexts.filter((text) => /之后|待会|回头|下次|记得|稍后|再来/u.test(text)),
  ]).slice(0, 8);
  const userPrefs = dedupe(historyTexts.filter((text) => /喜欢|偏好|讨厌|不想|想要/u.test(text))).slice(0, 8);
  const commitments = dedupe(texts.filter((text) => /我会|答应你|等我|给你|帮你/u.test(text))).slice(0, 8);
  const emotionalTemperature: InteractionSnapshot['emotionalTemperature'] = relationMoves.some((move) => /intimate|tease|closer/u.test(move))
    ? 'heated'
    : relationMoves.some((move) => /comfort|warm|陪伴|温柔/u.test(move))
      ? 'warm'
      : 'steady';

  const snapshot: InteractionSnapshot = {
    conversationId: input.conversationId,
    relationshipState: inferRelationshipState(deliveredBeats),
    activeScene: dedupe([...sceneMoves, ...mediaAssets.map((asset) => asset.kind)]).slice(0, 8),
    emotionalTemperature,
    assistantCommitments: commitments,
    userPrefs,
    openLoops,
    topicThreads: dedupe([...historyTexts, ...texts, ...mediaTexts]).slice(0, 8),
    lastResolvedTurnId: lastTurnId,
    conversationDirective: input.conversationDirective ?? null,
    updatedAt: new Date().toISOString(),
  };

  const relationMemorySlots: RelationMemorySlot[] = [
    ...userPrefs.map((value) => ({
      id: createStableSlotId({
        targetId: input.targetId,
        viewerId: input.viewerId,
        slotType: 'preference',
        key: value.slice(0, 48),
      }),
      targetId: input.targetId,
      viewerId: input.viewerId,
      slotType: 'preference' as const,
      key: value.slice(0, 48),
      value,
      confidence: 0.72,
      portability: 'portable' as const,
      sensitivity: 'safe' as const,
      userOverride: 'inherit' as const,
      updatedAt: snapshot.updatedAt,
    })),
    ...openLoops.map((value) => ({
      id: createStableSlotId({
        targetId: input.targetId,
        viewerId: input.viewerId,
        slotType: 'promise',
        key: value.slice(0, 48),
      }),
      targetId: input.targetId,
      viewerId: input.viewerId,
      slotType: 'promise' as const,
      key: value.slice(0, 48),
      value,
      confidence: 0.66,
      portability: 'local-only' as const,
      sensitivity: 'personal' as const,
      userOverride: 'inherit' as const,
      updatedAt: snapshot.updatedAt,
    })),
    ...relationMoves.map((value) => ({
      id: createStableSlotId({
        targetId: input.targetId,
        viewerId: input.viewerId,
        slotType: 'rapport',
        key: value.slice(0, 48),
      }),
      targetId: input.targetId,
      viewerId: input.viewerId,
      slotType: 'rapport' as const,
      key: value.slice(0, 48),
      value,
      confidence: 0.58,
      portability: 'local-only' as const,
      sensitivity: 'personal' as const,
      userOverride: 'inherit' as const,
      updatedAt: snapshot.updatedAt,
    })),
  ].slice(0, 12);

  const recallDocs: InteractionRecallDoc[] = dedupe([...historyTexts, ...texts, ...mediaTexts])
    .slice(-12)
    .map((value, index) => ({
      id: `recall_${createUlid()}`,
      conversationId: input.conversationId,
      sourceTurnId: index === dedupe([...historyTexts, ...texts]).slice(-12).length - 1 ? lastTurnId : null,
      text: value,
      createdAt: snapshot.updatedAt,
      updatedAt: snapshot.updatedAt,
    }));

  return {
    snapshot,
    relationMemorySlots,
    recallDocs,
  };
}
