import type { NarrativeSpineEvent, NarrativeStorySnapshot, NarrativeTurnRecord } from '../../../../modules/narrative-engine/src/index.js';
import { TEXTPLAY_DATA_API_WORLD_SPINE_PUBLISH } from '../contracts.js';
import type { TextplayDraftRecord, TextplayPersistRecord } from '../types.js';
import { createUlid } from '../utils/ulid.js';
import { type HookClient } from '@nimiplatform/sdk/mod';

type PublishEventInput = {
  id: string;
  payload: {
    type: string;
    content: string;
    participants?: string[];
    sceneContext?: {
      sceneId: string;
      sceneName?: string;
    };
    metadata?: Record<string, unknown>;
  };
  sceneId?: string;
};

type PublishSatelliteInput = {
  id: string;
  worldId: string;
  spineEventId?: string;
  sceneId?: string;
  type: string;
  provenance: 'REAL' | 'SYNTHETIC';
  content: string;
  narrativeWeight?: number;
  metadata?: Record<string, unknown>;
};

function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))];
}

function mapSpineNodeType(type: string): string {
  switch (type) {
    case 'dialogue':
      return 'DIALOGUE';
    case 'action':
      return 'ACTION';
    case 'thought':
      return 'THOUGHT';
    case 'observation':
    case 'scene-beat':
    case 'discovery':
    case 'relation-shift':
    case 'state-change':
      return 'OBSERVATION';
    case 'emotion':
      return 'EMOTION';
    case 'decision':
      return 'DECISION';
    case 'memory':
      return 'MEMORY';
    case 'gravity':
      return 'GRAVITY';
    case 'timeskip':
      return 'TIMESKIP';
    case 'branch-point':
      return 'BRANCH_POINT';
    default:
      return 'SYSTEM';
  }
}

function deriveEventContent(event: NarrativeSpineEvent, turn: NarrativeTurnRecord, record: TextplayPersistRecord | null): string {
  const payload = event.payload || {};
  return (
    toText(payload.summary)
    || toText(payload.content)
    || toText(payload.text)
    || toText(payload.description)
    || toText(record?.text)
    || toText(turn.input.userMessage)
    || event.type
  );
}

function deriveParticipants(input: {
  event: NarrativeSpineEvent;
  turn: NarrativeTurnRecord;
  record: TextplayPersistRecord | null;
  draft: TextplayDraftRecord;
}): string[] {
  const payload = input.event.payload || {};
  const payloadParticipants = Array.isArray(payload.participants)
    ? payload.participants.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  return unique([
    input.draft.agentId,
    input.draft.userId,
    ...payloadParticipants,
    toText(input.event.thinker),
    toText(input.event.decider),
    toText(input.event.experiencer),
    toText(input.event.owner),
    ...(Array.isArray(input.record?.meta?.sourceEventIds) ? [] : []),
  ]);
}

function findSceneName(draft: TextplayDraftRecord, sceneId: string): string | undefined {
  const matched = draft.startupPackage.materials.scenes.find((scene) => scene.id === sceneId);
  return matched?.name || undefined;
}

function buildTurnSatelliteContent(input: {
  draft: TextplayDraftRecord;
  turn: NarrativeTurnRecord;
  record: TextplayPersistRecord | null;
}): string {
  return JSON.stringify({
    schema: 'textplay.turn-artifact.v1',
    storyId: input.draft.storyId,
    entryEventId: input.draft.entryEventId,
    sessionId: input.draft.sessionId,
    worldId: input.draft.worldId,
    agentId: input.draft.agentId,
    userId: input.draft.userId,
    turnId: input.turn.turnId,
    runId: input.turn.runId,
    traceId: input.turn.traceId,
    triggerSource: input.turn.triggerSource,
    userMessage: input.turn.input.userMessage,
    playerName: input.draft.playerName,
    playerIdentity: input.draft.playerIdentity,
    renderedText: input.record?.text || '',
    route: input.record?.meta?.route || null,
    warnings: input.record?.warnings || [],
    runEvents: input.record?.runEvents || [],
    runSnapshot: input.record?.runSnapshot || null,
    projection: input.draft.engineSnapshot.projections[input.turn.turnId] || null,
    createdAt: input.record?.createdAt || input.turn.createdAt,
    updatedAt: input.record?.updatedAt || input.turn.updatedAt,
  });
}

function buildFallbackEventForTurn(turn: NarrativeTurnRecord, draft: TextplayDraftRecord, record: TextplayPersistRecord | null): NarrativeSpineEvent[] {
  return [{
    id: `${turn.turnId}:fallback`,
    type: 'system',
    visibility: 'public',
    payload: {
      content: toText(record?.text) || toText(turn.input.userMessage) || 'Narrative turn',
      summary: toText(record?.text) || toText(turn.input.userMessage) || 'Narrative turn',
      storyId: draft.storyId,
      turnId: turn.turnId,
    },
    sourceEventIds: [turn.turnId],
    owner: draft.agentId,
  }];
}

export function buildTextplaySpinePublishBody(draft: TextplayDraftRecord): {
  events: PublishEventInput[];
  satellites: PublishSatelliteInput[];
} {
  const snapshot: NarrativeStorySnapshot = draft.engineSnapshot;
  const events: PublishEventInput[] = [];
  const satellites: PublishSatelliteInput[] = [];
  const publishedEventIdsByLocalId = new Map<string, string>();
  const sceneId = draft.startupPackage.entry.recommendedSceneId || undefined;
  const sceneName = sceneId ? findSceneName(draft, sceneId) : undefined;

  for (const turnId of snapshot.turnIds) {
    const turn = snapshot.turns[turnId];
    if (!turn) {
      continue;
    }
    const record = draft.records.find((item) => item.turnId === turnId) || null;
    const localEvents = turn.coreOutput?.spineEvents?.length
      ? turn.coreOutput.spineEvents
      : buildFallbackEventForTurn(turn, draft, record);

    for (const localEvent of localEvents) {
      const publishedEventId = createUlid();
      publishedEventIdsByLocalId.set(localEvent.id, publishedEventId);
      const participants = deriveParticipants({
        event: localEvent,
        turn,
        record,
        draft,
      });
      events.push({
        id: publishedEventId,
        payload: {
          type: mapSpineNodeType(localEvent.type),
          content: deriveEventContent(localEvent, turn, record),
          ...(participants.length > 0 ? { participants } : {}),
          ...(sceneId ? { sceneContext: { sceneId, ...(sceneName ? { sceneName } : {}) } } : {}),
          metadata: {
            storyId: draft.storyId,
            entryEventId: draft.entryEventId,
            sessionId: draft.sessionId,
            turnId,
            localEventId: localEvent.id,
            triggerSource: turn.triggerSource,
            visibility: localEvent.visibility,
            sourceEventIds: localEvent.sourceEventIds || [],
            localPayload: localEvent.payload || {},
            thinker: localEvent.thinker || undefined,
            decider: localEvent.decider || undefined,
            experiencer: localEvent.experiencer || undefined,
            owner: localEvent.owner || undefined,
          },
        },
        ...(sceneId ? { sceneId } : {}),
      });
    }

    const finalEventId = publishedEventIdsByLocalId.get(localEvents[localEvents.length - 1]!.id);
    satellites.push({
      id: createUlid(),
      worldId: draft.worldId,
      ...(finalEventId ? { spineEventId: finalEventId } : {}),
      ...(sceneId ? { sceneId } : {}),
      type: 'DETAIL',
      provenance: 'REAL',
      content: buildTurnSatelliteContent({
        draft,
        turn,
        record,
      }),
      narrativeWeight: 1,
      metadata: {
        source: turn.triggerSource === 'UserTurn' ? 'USER_INPUT' : 'SYSTEM_GENERATED',
        visibility: 'PUBLIC',
        importance: 0.5,
      },
    });
  }

  return {
    events,
    satellites,
  };
}

export async function publishTextplayStoryDraft(input: {
  hookClient: HookClient;
  draft: TextplayDraftRecord;
}): Promise<unknown> {
  const body = buildTextplaySpinePublishBody(input.draft);
  return input.hookClient.data.query({
    capability: TEXTPLAY_DATA_API_WORLD_SPINE_PUBLISH,
    query: {
      worldId: input.draft.worldId,
      storyId: input.draft.storyId,
      agentId: input.draft.agentId,
      body,
    },
  });
}
