import type {
  NarrativeContextSnapshot,
  NarrativeCoreOutput,
  NarrativeSpineEvent,
  NarrativeTriggerSource,
} from '../types.js';

type EventFingerprint = {
  sceneKey: string;
  actorIds: string[];
  tokens: string[];
};

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function tokenize(value: string): string[] {
  const source = String(value || '').trim().toLowerCase();
  if (!source) return [];
  const matches = source.match(/[\p{Script=Han}]{2,}|[a-z0-9]{3,}/gu) || [];
  return uniqueStrings(matches);
}

function flattenStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const output: string[] = [];
  value.forEach((item) => {
    if (typeof item === 'string') {
      output.push(item);
      return;
    }
    if (item && typeof item === 'object') {
      const record = item as Record<string, unknown>;
      output.push(
        String(record.id || ''),
        String(record.name || ''),
        String(record.actorId || ''),
        String(record.characterId || ''),
      );
    }
  });
  return uniqueStrings(output);
}

function extractEventText(event: NarrativeSpineEvent): string {
  const payload = event.payload || {};
  const parts = [
    payload.content,
    payload.summary,
    payload.text,
    payload.description,
    payload.action,
    payload.choice,
    payload.emotion,
    payload.subject,
    payload.detail,
    payload.title,
    payload.name,
  ];
  return parts.map((item) => String(item || '').trim()).filter(Boolean).join(' ');
}

function extractSceneKey(event: NarrativeSpineEvent): string {
  const payload = event.payload || {};
  return String(
    payload.sceneId
    || payload.scene
    || payload.place
    || payload.location
    || payload.locationId
    || payload.sceneName
    || '',
  ).trim().toLowerCase();
}

function extractActorIds(event: NarrativeSpineEvent): string[] {
  const payload = event.payload || {};
  return uniqueStrings([
    event.thinker || '',
    event.decider || '',
    event.experiencer || '',
    event.owner || '',
    ...flattenStringArray(payload.actorIds),
    ...flattenStringArray(payload.participantIds),
    ...flattenStringArray(payload.participants),
    ...flattenStringArray(payload.characterRefs),
    ...flattenStringArray(payload.actors),
  ]);
}

function fingerprintEvent(event: NarrativeSpineEvent): EventFingerprint {
  return {
    sceneKey: extractSceneKey(event),
    actorIds: extractActorIds(event),
    tokens: tokenize(extractEventText(event)),
  };
}

function buildPressureTokens(snapshot: NarrativeContextSnapshot): string[] {
  return uniqueStrings([
    ...snapshot.openThreads.flatMap((item) => tokenize(item)),
    ...snapshot.futurePressure.flatMap((item) => tokenize(item)),
  ]);
}

function scoreCandidate(input: {
  current: EventFingerprint;
  currentTokens: Set<string>;
  pressureTokens: Set<string>;
  candidate: NarrativeSpineEvent;
  candidateFingerprint: EventFingerprint;
  recencyIndex: number;
  totalCandidates: number;
}): number {
  let score = 0;
  if (input.current.sceneKey && input.current.sceneKey === input.candidateFingerprint.sceneKey) {
    score += 4;
  }
  const actorOverlap = input.current.actorIds.filter((actorId) => input.candidateFingerprint.actorIds.includes(actorId)).length;
  if (actorOverlap > 0) {
    score += Math.min(4, actorOverlap * 2);
  }
  const tokenOverlap = input.candidateFingerprint.tokens.filter((token) => input.currentTokens.has(token)).length;
  if (tokenOverlap > 0) {
    score += Math.min(3, tokenOverlap);
  }
  const pressureOverlap = input.candidateFingerprint.tokens.filter((token) => input.pressureTokens.has(token)).length;
  if (pressureOverlap > 0) {
    score += 2;
  }
  if (input.candidate.type === 'decision' || input.candidate.type === 'action' || input.candidate.type === 'discovery') {
    score += 1;
  }
  score += Math.max(0, (input.recencyIndex + 1) / Math.max(1, input.totalCandidates));
  return score;
}

function normalizeSourceEventIds(event: NarrativeSpineEvent): string[] {
  return uniqueStrings(
    Array.isArray(event.sourceEventIds)
      ? event.sourceEventIds.map((item) => String(item || '').trim())
      : [],
  ).filter((eventId) => eventId !== event.id);
}

export function enrichNarrativeCoreOutputCausality(input: {
  triggerSource: NarrativeTriggerSource;
  snapshot: NarrativeContextSnapshot;
  recentSpineEvents: NarrativeSpineEvent[];
  coreOutput: NarrativeCoreOutput;
}): NarrativeCoreOutput {
  if (input.recentSpineEvents.length === 0) {
    return {
      ...input.coreOutput,
      spineEvents: input.coreOutput.spineEvents.map((event) => ({
        ...event,
        ...(normalizeSourceEventIds(event).length > 0
          ? { sourceEventIds: normalizeSourceEventIds(event) }
          : {}),
      })),
    };
  }

  const pressureTokens = new Set(buildPressureTokens(input.snapshot));
  const history: NarrativeSpineEvent[] = [...input.recentSpineEvents];
  const enrichedEvents = input.coreOutput.spineEvents.map((event) => {
    const normalizedSourceEventIds = normalizeSourceEventIds(event);
    if (normalizedSourceEventIds.length > 0) {
      const nextEvent = {
        ...event,
        sourceEventIds: normalizedSourceEventIds,
      };
      history.push(nextEvent);
      return nextEvent;
    }

    const currentFingerprint = fingerprintEvent(event);
    const currentTokens = new Set(currentFingerprint.tokens);
    const ranked = history
      .slice(-20)
      .map((candidate, index, candidates) => ({
        candidate,
        score: scoreCandidate({
          current: currentFingerprint,
          currentTokens,
          pressureTokens,
          candidate,
          candidateFingerprint: fingerprintEvent(candidate),
          recencyIndex: index,
          totalCandidates: candidates.length,
        }),
      }))
      .filter((item) => item.score >= 3)
      .sort((left, right) => right.score - left.score)
      .slice(0, 2)
      .map((item) => item.candidate.id);

    const nextEvent = ranked.length > 0
      ? { ...event, sourceEventIds: uniqueStrings(ranked) }
      : event;
    history.push(nextEvent);
    return nextEvent;
  });

  return {
    ...input.coreOutput,
    spineEvents: enrichedEvents,
  };
}
