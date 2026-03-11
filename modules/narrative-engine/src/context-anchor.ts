type NarrativeContextRowLike = Record<string, unknown>;

export type NarrativeContextAnchorResolution = {
  requestedStoryId: string;
  resolvedStoryId: string | null;
  matchedRowId: string | null;
  strategy: 'exact' | 'stable-single' | 'stable-scored' | 'none';
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function toString(value: unknown): string {
  return String(value || '').trim();
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => toString(item)).filter(Boolean);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((item) => toString(item)).filter(Boolean))];
}

function toTimestampMs(value: unknown): number {
  const parsed = Date.parse(toString(value) || '1970-01-01T00:00:00.000Z');
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isEventDerivedStoryId(storyId: string): boolean {
  const normalized = toString(storyId);
  if (!normalized.startsWith('story.')) {
    return false;
  }
  return normalized.split('.').length >= 3;
}

function pickLatestRow(rows: NarrativeContextRowLike[]): NarrativeContextRowLike | null {
  if (rows.length === 0) {
    return null;
  }
  const ordered = [...rows].sort((left, right) => {
    const updatedAtDelta = toTimestampMs(right.updatedAt) - toTimestampMs(left.updatedAt);
    if (updatedAtDelta !== 0) {
      return updatedAtDelta;
    }
    return toString(right.id).localeCompare(toString(left.id));
  });
  return ordered[0] || null;
}

function computeStableStoryScore(input: {
  row: NarrativeContextRowLike;
  primaryAgentId: string;
  participantIds: string[];
  locationRefs: string[];
  entryEventId: string;
}): number {
  const storySetting = asRecord(input.row.narrativeSetting);
  const storyState = asRecord(input.row.narrativeState);
  const castPolicy = asRecord(storySetting.castPolicy);
  const mandatorySubjectIds = toStringArray(castPolicy.mandatorySubjectIds);
  const optionalSubjectIds = toStringArray(castPolicy.optionalSubjectIds);
  const candidateSubjects = uniqueStrings([...mandatorySubjectIds, ...optionalSubjectIds]);
  const currentSceneId = toString(storyState.currentSceneId || storySetting.recommendedSceneId);
  const scopeKey = toString(input.row.scopeKey).toLowerCase();
  const storyId = toString(input.row.storyId).toLowerCase();

  let score = 0;
  if (input.primaryAgentId && candidateSubjects.includes(input.primaryAgentId)) {
    score += 60;
  }

  for (const participantId of input.participantIds) {
    if (candidateSubjects.includes(participantId)) {
      score += 30;
    }
  }

  if (currentSceneId && input.locationRefs.includes(currentSceneId)) {
    score += 40;
  }

  const eventId = input.entryEventId.toLowerCase();
  if (eventId && (scopeKey.includes(eventId) || storyId.includes(eventId))) {
    score += 20;
  }

  return score;
}

export function resolveNarrativeContextStoryAnchor(input: {
  rows: NarrativeContextRowLike[];
  requestedStoryId: string;
  primaryAgentId?: string;
  participantIds?: string[];
  locationRefs?: string[];
  entryEventId?: string;
}): NarrativeContextAnchorResolution {
  const requestedStoryId = toString(input.requestedStoryId);
  const storyRows = input.rows.filter((row) => toString(row.scope).toUpperCase() === 'STORY');
  if (!requestedStoryId || storyRows.length === 0) {
    return {
      requestedStoryId,
      resolvedStoryId: null,
      matchedRowId: null,
      strategy: 'none',
    };
  }

  const exactRows = storyRows.filter((row) => toString(row.storyId) === requestedStoryId);
  if (exactRows.length > 0) {
    const exact = pickLatestRow(exactRows);
    return {
      requestedStoryId,
      resolvedStoryId: requestedStoryId,
      matchedRowId: exact ? toString(exact.id) || null : null,
      strategy: 'exact',
    };
  }

  const stableStoryIds = uniqueStrings(
    storyRows
      .map((row) => toString(row.storyId))
      .filter((storyId) => !isEventDerivedStoryId(storyId)),
  );

  if (stableStoryIds.length === 1) {
    const resolvedStoryId = stableStoryIds[0] || null;
    const row = pickLatestRow(storyRows.filter((candidate) => toString(candidate.storyId) === resolvedStoryId));
    return {
      requestedStoryId,
      resolvedStoryId,
      matchedRowId: row ? toString(row.id) || null : null,
      strategy: 'stable-single',
    };
  }

  if (stableStoryIds.length > 1) {
    const participantIds = uniqueStrings(input.participantIds || []);
    const locationRefs = uniqueStrings(input.locationRefs || []);
    const primaryAgentId = toString(input.primaryAgentId);
    const entryEventId = toString(input.entryEventId);

    const ranked = stableStoryIds
      .map((storyId) => {
        const rows = storyRows.filter((row) => toString(row.storyId) === storyId);
        const row = pickLatestRow(rows);
        const score = row
          ? computeStableStoryScore({
            row,
            primaryAgentId,
            participantIds,
            locationRefs,
            entryEventId,
          })
          : -1;
        return {
          storyId,
          row,
          score,
        };
      })
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        return toString(right.storyId).localeCompare(toString(left.storyId));
      });

    if (ranked.length > 0 && ranked[0] && ranked[0].score > 0) {
      const [best, second] = ranked;
      if (!second || best.score > second.score) {
        return {
          requestedStoryId,
          resolvedStoryId: best.storyId,
          matchedRowId: best.row ? toString(best.row.id) || null : null,
          strategy: 'stable-scored',
        };
      }
    }
  }

  return {
    requestedStoryId,
    resolvedStoryId: null,
    matchedRowId: null,
    strategy: 'none',
  };
}

function filterRowsForScope(rows: NarrativeContextRowLike[], scope: string): NarrativeContextRowLike[] {
  return rows.filter((row) => toString(row.scope).toUpperCase() === scope);
}

function pickBestRankedRow(input: {
  rows: NarrativeContextRowLike[];
  score: (row: NarrativeContextRowLike) => number;
  minimumScore?: number;
}): NarrativeContextRowLike | null {
  if (input.rows.length === 0) {
    return null;
  }
  const ranked = input.rows
    .map((row) => ({
      row,
      score: input.score(row),
      updatedAt: toTimestampMs(row.updatedAt),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      if (right.updatedAt !== left.updatedAt) {
        return right.updatedAt - left.updatedAt;
      }
      return toString(right.row.id).localeCompare(toString(left.row.id));
    });
  if (ranked.length === 0) {
    return null;
  }
  if (typeof input.minimumScore === 'number' && ranked[0]!.score < input.minimumScore) {
    return null;
  }
  if (ranked.length > 1 && ranked[0]!.score === ranked[1]!.score) {
    return null;
  }
  return ranked[0]!.row;
}

function withStoryPriority(input: {
  row: NarrativeContextRowLike;
  resolvedStoryId: string | null;
}): number {
  const rowStoryId = toString(input.row.storyId);
  if (input.resolvedStoryId && rowStoryId === input.resolvedStoryId) {
    return 100;
  }
  if (!rowStoryId) {
    return 20;
  }
  return -50;
}

function isRowCompatibleWithResolvedStory(input: {
  row: NarrativeContextRowLike;
  resolvedStoryId: string | null;
}): boolean {
  const rowStoryId = toString(input.row.storyId);
  if (input.resolvedStoryId) {
    return !rowStoryId || rowStoryId === input.resolvedStoryId;
  }
  return !rowStoryId;
}

export function pickNarrativeStoryContextRow(input: {
  rows: NarrativeContextRowLike[];
  resolvedStoryId: string | null;
}): NarrativeContextRowLike | null {
  if (!input.resolvedStoryId) {
    return null;
  }
  return pickBestRankedRow({
    rows: filterRowsForScope(input.rows, 'STORY'),
    score: (row) => (toString(row.storyId) === input.resolvedStoryId ? 1 : -1),
    minimumScore: 1,
  });
}

export function pickNarrativeSubjectContextRow(input: {
  rows: NarrativeContextRowLike[];
  resolvedStoryId: string | null;
  primaryAgentId: string;
}): NarrativeContextRowLike | null {
  const primaryAgentId = toString(input.primaryAgentId);
  if (!primaryAgentId) {
    return null;
  }
  return pickBestRankedRow({
    rows: filterRowsForScope(input.rows, 'SUBJECT'),
    score: (row) => {
      if (!isRowCompatibleWithResolvedStory({
        row,
        resolvedStoryId: input.resolvedStoryId,
      })) {
        return -1;
      }
      const subjectId = toString(row.subjectId);
      const subjectType = toString(row.subjectType).toUpperCase();
      if (subjectId !== primaryAgentId || subjectType !== 'AGENT') {
        return -1;
      }
      return withStoryPriority({
        row,
        resolvedStoryId: input.resolvedStoryId,
      });
    },
    minimumScore: 1,
  });
}

export function pickNarrativeRelationContextRow(input: {
  rows: NarrativeContextRowLike[];
  resolvedStoryId: string | null;
  primaryAgentId: string;
  playerId?: string;
  candidateAgentIds?: string[];
}): NarrativeContextRowLike | null {
  const primaryAgentId = toString(input.primaryAgentId);
  const playerId = toString(input.playerId);
  const candidateAgentIds = uniqueStrings(input.candidateAgentIds || []).filter((item) => item !== primaryAgentId);
  if (!primaryAgentId) {
    return null;
  }
  return pickBestRankedRow({
    rows: filterRowsForScope(input.rows, 'RELATION'),
    score: (row) => {
      if (!isRowCompatibleWithResolvedStory({
        row,
        resolvedStoryId: input.resolvedStoryId,
      })) {
        return -1;
      }
      const subjectId = toString(row.subjectId);
      const targetSubjectId = toString(row.targetSubjectId);
      const subjectType = toString(row.subjectType).toUpperCase();
      const targetSubjectType = toString(row.targetSubjectType).toUpperCase();
      const includesPrimaryAgent = subjectId === primaryAgentId || targetSubjectId === primaryAgentId;
      if (!includesPrimaryAgent) {
        return -1;
      }

      const otherId = subjectId === primaryAgentId ? targetSubjectId : subjectId;
      const otherType = subjectId === primaryAgentId ? targetSubjectType : subjectType;

      let score = withStoryPriority({
        row,
        resolvedStoryId: input.resolvedStoryId,
      });

      if (otherType === 'PLAYER' && playerId && otherId === playerId) {
        score += 200;
      }
      if (otherType === 'AGENT' && candidateAgentIds.includes(otherId)) {
        score += 140;
      }
      if (otherType === 'AGENT') {
        score += 30;
      }

      return score;
    },
    minimumScore: 1,
  });
}
