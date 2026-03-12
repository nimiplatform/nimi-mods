import type {
  NarrativeContextSnapshot,
  NarrativeCoreOutput,
  NarrativeProjectionEvent,
  NarrativeRenderInput,
  NarrativeTurnInputNormalized,
} from '../types.js';

function uniqueStrings(input: string[]): string[] {
  return [...new Set(input.map((item) => String(item || '').trim()).filter(Boolean))];
}

export function collectProjectionSourceEventIds(coreOutput: NarrativeCoreOutput): string[] {
  const sourceIds: string[] = [];
  for (const event of coreOutput.spineEvents) {
    sourceIds.push(String(event.id || '').trim());
    if (Array.isArray(event.sourceEventIds)) {
      for (const sourceEventId of event.sourceEventIds) {
        sourceIds.push(String(sourceEventId || '').trim());
      }
    }
  }
  return uniqueStrings(sourceIds);
}

export function buildNarrativeRenderInput(input: {
  turn: NarrativeTurnInputNormalized;
  snapshot: NarrativeContextSnapshot;
  coreOutput: NarrativeCoreOutput;
}): NarrativeRenderInput {
  const events: NarrativeProjectionEvent[] = input.coreOutput.spineEvents.map((event) => {
    const payload = event.payload || {};
    const content = String(
      payload.content
      || payload.summary
      || payload.text
      || payload.description
      || payload.action
      || payload.choice
      || payload.emotion
      || payload.subject
      || payload.detail
      || payload.skipLabel
      || payload.branchReason
      || payload.memoryType
      || event.type,
    ).trim();
    const sourceEventIds = Array.isArray(event.sourceEventIds)
      ? event.sourceEventIds.map((item) => String(item || '').trim()).filter(Boolean)
      : [];

    return {
      eventId: event.id,
      type: event.type,
      visibility: event.visibility,
      content: content || event.type,
      payload,
      sourceEventIds: sourceEventIds.length > 0 ? sourceEventIds : [event.id],
      thinker: event.thinker,
      decider: event.decider,
      experiencer: event.experiencer,
      owner: event.owner,
    };
  });

  const sourceEventIds = collectProjectionSourceEventIds(input.coreOutput);
  const sceneSummary = input.snapshot.sceneMaterial[0]
    || `Scene anchored at ${input.snapshot.place}`;
  const agentSummary = input.snapshot.availableActors.length > 0
    ? `Available actors: ${input.snapshot.availableActors.join(', ')}`
    : `Primary agent ${input.turn.agentId}`;
  const worldStyleSummary = input.snapshot.worldviewRules[0]
    || 'Narrative style follows canonical world rules.';

  return {
    turnId: input.turn.turnId,
    storyId: input.turn.storyId,
    triggerSource: input.turn.triggerSource,
    userMessage: input.turn.userMessage,
    systemPayload: input.turn.systemContext,
    systemContext: input.turn.systemContext,
    events,
    worldStyle: {
      summary: worldStyleSummary,
      ...input.snapshot.narrativeStyle,
      worldviewRules: input.snapshot.worldviewRules,
      phase: input.snapshot.phase,
      objective: input.snapshot.objective,
      tensionTarget: input.snapshot.tensionTarget,
      openThreads: input.snapshot.openThreads,
      startupPolicy: input.snapshot.startupPolicy,
      contextCoverage: input.snapshot.contextCoverage,
    },
    player: {
      id: input.turn.userId,
    },
    scene: {
      place: input.snapshot.place,
      summary: sceneSummary,
    },
    agent: {
      id: input.turn.agentId,
      summary: agentSummary,
    },
    playerAnchor: {
      id: input.turn.userId,
    },
    sceneAnchor: {
      place: input.snapshot.place,
      material: input.snapshot.sceneMaterial,
      futurePressure: input.snapshot.futurePressure,
    },
    agentAnchor: {
      id: input.turn.agentId,
      availableActors: input.snapshot.availableActors,
      relations: input.snapshot.characterRelations,
    },
    metrics: input.coreOutput.metrics,
    sourceEventIds,
  };
}
