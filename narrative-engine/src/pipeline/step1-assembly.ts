import { asRecord } from '@nimiplatform/sdk/mod/utils';
import { NARRATIVE_REASON_CODES } from '../contracts.js';
import { NarrativeContextSnapshotSchema } from '../schemas.js';
import type {
  NarrativeContextScopes,
  NarrativeContextSnapshot,
  NarrativeRouteOptionsSnapshot,
  NarrativeStepResult,
  NarrativeTurnInputNormalized,
} from '../types.js';

type NarrativePromptStats = {
  sectionChars: Record<string, number>;
  totalPromptChars: number;
  sourceCounts: {
    worldEvents: number;
    worldLorebooks: number;
    worldScenes: number;
    narrativeContexts: number;
    memoryItems: number;
  };
  selectedCounts: {
    timelineEvents: number;
    futureEvents: number;
    advanceHints: number;
    lorebooks: number;
    scenes: number;
    relations: number;
    memories: number;
  };
};

type NarrativeAssemblyAssets = {
  routeOptions: NarrativeRouteOptionsSnapshot;
  compiledPrompt: string;
  promptStats: NarrativePromptStats;
};

export type NarrativeStep1AssemblyResult = {
  snapshot: NarrativeContextSnapshot;
  assets: NarrativeAssemblyAssets;
};

function toString(value: unknown): string {
  return String(value || '').trim();
}

function normalizeWhitespace(value: string): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function clipText(value: unknown, maxChars: number): string {
  const normalized = normalizeWhitespace(toString(value));
  if (!normalized) {
    return '';
  }
  if (normalized.length <= maxChars) {
    return normalized;
  }
  if (maxChars <= 3) {
    return normalized.slice(0, maxChars);
  }
  return `${normalized.slice(0, maxChars - 3)}...`;
}

function clipJson(value: unknown, maxChars: number): string {
  if (value == null) {
    return '';
  }
  try {
    return clipText(JSON.stringify(value), maxChars);
  } catch {
    return clipText(String(value), maxChars);
  }
}

function toNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
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

function extractStoryEntryEventId(storyId: string): string {
  const parts = toString(storyId).split('.');
  if (parts.length < 3) {
    return '';
  }
  return toString(parts[parts.length - 1]);
}

function toRecordArray(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value
      .map((item) => asRecord(item))
      .filter((item) => Object.keys(item).length > 0);
  }
  const record = asRecord(value);
  if (Array.isArray(record.items)) {
    return toRecordArray(record.items);
  }
  if (Array.isArray(record.rows)) {
    return toRecordArray(record.rows);
  }
  if (Array.isArray(record.data)) {
    return toRecordArray(record.data);
  }
  return [];
}

function toNarrativeRouteOptions(turn: NarrativeTurnInputNormalized): NarrativeRouteOptionsSnapshot {
  const selected = asRecord(turn.binding);
  return {
    capability: turn.capability,
    selected: {
      source: toString(selected.source),
      model: toString(selected.model),
      connectorId: toString(selected.connectorId),
    },
  };
}

function extractWorldviewRules(lorebooks: Array<Record<string, unknown>>): string[] {
  const rules: string[] = [];
  for (const lorebook of lorebooks) {
    const key = toString(lorebook.key || lorebook.id || lorebook.title);
    const content = toString(lorebook.content || lorebook.summary || lorebook.description);
    const valueText = typeof lorebook.value === 'object' && lorebook.value
      ? JSON.stringify(lorebook.value)
      : toString(lorebook.value);
    if (key) {
      rules.push(key);
    }
    if (content) {
      rules.push(content);
    }
    if (valueText) {
      rules.push(valueText);
    }
  }
  return uniqueStrings(rules).slice(0, 60);
}

function extractFuturePressure(worldEvents: Array<Record<string, unknown>>): string[] {
  const rows = worldEvents
    .filter((event) => toString(event.eventHorizon).toUpperCase() === 'FUTURE')
    .flatMap((event) => [
      toString(event.title || event.name),
      toString(event.summary || event.description || event.process),
      toString(event.result),
    ])
    .filter(Boolean);
  return uniqueStrings(rows).slice(0, 12);
}

function extractSceneMaterial(input: {
  worldEvents: Array<Record<string, unknown>>;
  storyScope: Record<string, unknown>;
  scene: Record<string, unknown> | null;
}): string[] {
  const materials: string[] = [];
  for (const event of input.worldEvents) {
    const title = toString(event.title || event.name);
    const summary = toString(event.summary || event.description || event.process);
    const cause = toString(event.cause);
    const result = toString(event.result);
    if (title) materials.push(title);
    if (summary) materials.push(summary);
    if (cause) materials.push(cause);
    if (result) materials.push(result);
  }

  const materialHints = asRecord(input.storyScope.materialHints);
  if (Object.keys(materialHints).length > 0) {
    materials.push(JSON.stringify(materialHints));
  }

  if (input.scene) {
    const sceneName = toString(input.scene.name);
    const sceneDescription = toString(input.scene.description);
    if (sceneName) {
      materials.push(sceneName);
    }
    if (sceneDescription) {
      materials.push(sceneDescription);
    }
  }

  return uniqueStrings(materials).slice(0, 80);
}

function extractActors(input: {
  worldEvents: Array<Record<string, unknown>>;
  scene: Record<string, unknown> | null;
  turn: NarrativeTurnInputNormalized;
}): string[] {
  const actors: string[] = [input.turn.agentId, input.turn.playerId];
  for (const event of input.worldEvents) {
    const fields = [
      ...toStringArray(event.characterRefs),
      ...toStringArray(event.actors),
    ];
    fields.forEach((field) => actors.push(field));
  }
  if (input.scene) {
    toStringArray(input.scene.activeEntities).forEach((entity) => actors.push(entity));
  }
  return uniqueStrings(actors).slice(0, 24);
}

function extractCharacterRelations(scopes: NarrativeContextScopes): Array<Record<string, unknown>> {
  const relation = asRecord(scopes.RELATION);
  const relationArray = relation.relations;
  if (Array.isArray(relationArray)) {
    return relationArray
      .map((item) => asRecord(item))
      .filter((item) => Object.keys(item).length > 0)
      .slice(0, 20);
  }
  if (Object.keys(relation).length > 0) {
    return [relation];
  }
  return [];
}

function pickLatestScopeRow(input: {
  rows: Array<Record<string, unknown>>;
  scope: 'CANON' | 'STORY' | 'SUBJECT' | 'RELATION';
  score?: (row: Record<string, unknown>) => number;
  minimumScore?: number;
}): Record<string, unknown> | null {
  const rows = input.rows.filter((row) => toString(row.scope).toUpperCase() === input.scope);
  if (rows.length === 0) {
    return null;
  }

  const ordered = rows
    .map((row) => ({
      row,
      updatedAt: Date.parse(toString(row.updatedAt) || '1970-01-01T00:00:00.000Z') || 0,
      score: input.score ? input.score(row) : 0,
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
  if (ordered.length === 0) {
    return null;
  }
  if (typeof input.minimumScore === 'number' && ordered[0]!.score < input.minimumScore) {
    return null;
  }
  return ordered[0]!.row;
}

function resolveNarrativeScopes(input: {
  rows: Array<Record<string, unknown>>;
  turn: NarrativeTurnInputNormalized;
}): {
  scopes: NarrativeContextScopes;
  coverage: NarrativeContextSnapshot['contextCoverage'];
} {
  const canon = pickLatestScopeRow({
    rows: input.rows,
    scope: 'CANON',
  });
  const storyExact = pickLatestScopeRow({
    rows: input.rows,
    scope: 'STORY',
    score: (row) => (toString(row.storyId) === input.turn.storyId ? 1 : -1),
    minimumScore: 1,
  });
  const storyFallback = storyExact
    ? null
    : pickLatestScopeRow({
      rows: input.rows,
      scope: 'STORY',
    });
  const story = storyExact || storyFallback;
  const subject = pickLatestScopeRow({
    rows: input.rows,
    scope: 'SUBJECT',
    score: (row) => (toString(row.subjectId) === input.turn.agentId ? 1 : -1),
    minimumScore: 1,
  });
  const relation = pickLatestScopeRow({
    rows: input.rows,
    scope: 'RELATION',
    score: (row) => {
      const subjectId = toString(row.subjectId);
      const targetSubjectId = toString(row.targetSubjectId);
      const direct = subjectId === input.turn.agentId && targetSubjectId === input.turn.playerId;
      const reverse = subjectId === input.turn.playerId && targetSubjectId === input.turn.agentId;
      return direct || reverse ? 1 : -1;
    },
    minimumScore: 1,
  });

  const canonScope = {
    ...asRecord(canon?.narrativeSetting),
    ...asRecord(canon?.narrativeState),
  };
  const storyScope = {
    ...asRecord(story?.narrativeSetting),
    ...asRecord(story?.narrativeState),
  };
  const subjectScope = {
    ...asRecord(subject?.narrativeSetting),
    ...asRecord(subject?.narrativeState),
  };
  const relationScope = {
    ...asRecord(relation?.narrativeSetting),
    ...asRecord(relation?.narrativeState),
  };

  const warnings: string[] = [];
  if (!storyExact && storyFallback) {
    warnings.push('NARRATIVE_CONTEXT_STORY_SCOPE_FALLBACK_WARN');
  }
  if (!subject) {
    warnings.push('NARRATIVE_CONTEXT_SUBJECT_MISSING_WARN');
  }
  if (!relation) {
    warnings.push('NARRATIVE_CONTEXT_RELATION_MISSING_WARN');
  }

  return {
    scopes: {
      CANON: canonScope,
      STORY: storyScope,
      SUBJECT: subjectScope,
      RELATION: relationScope,
    },
    coverage: {
      canon: Boolean(canon),
      story: Boolean(story),
      subject: Boolean(subject),
      relation: Boolean(relation),
      scene: false,
      warnings,
    },
  };
}

function resolveScene(input: {
  worldScenes: Array<Record<string, unknown>>;
  worldEvents: Array<Record<string, unknown>>;
  storyScope: Record<string, unknown>;
}): Record<string, unknown> | null {
  const sceneById = new Map<string, Record<string, unknown>>();
  for (const scene of input.worldScenes) {
    const id = toString(scene.id);
    if (id) {
      sceneById.set(id, scene);
    }
  }

  const preferredSceneId = toString(input.storyScope.recommendedSceneId);
  if (preferredSceneId && sceneById.has(preferredSceneId)) {
    return sceneById.get(preferredSceneId) || null;
  }

  for (const event of input.worldEvents) {
    const refs = toStringArray(event.locationRefs);
    for (const ref of refs) {
      if (sceneById.has(ref)) {
        return sceneById.get(ref) || null;
      }
    }
  }

  return input.worldScenes[0] || null;
}

function hasSufficientContext(snapshot: NarrativeContextSnapshot): boolean {
  if (!snapshot.contextCoverage.canon || !snapshot.contextCoverage.story) {
    return false;
  }
  if (!snapshot.place) {
    return false;
  }
  if (snapshot.worldviewRules.length === 0 && snapshot.sceneMaterial.length === 0) {
    return false;
  }
  return true;
}

function selectTimelineEvents(input: {
  worldEvents: Array<Record<string, unknown>>;
  turn: NarrativeTurnInputNormalized;
  entryEventId: string;
}): Array<Record<string, unknown>> {
  const rows = input.worldEvents
    .filter((event) => toString(event.eventHorizon).toUpperCase() !== 'FUTURE')
    .map((event) => {
      const refs = toStringArray(event.characterRefs);
      const level = toString(event.level).toUpperCase();
      const horizon = toString(event.eventHorizon).toUpperCase();
      const id = toString(event.id);
      let score = 0;
      if (id && id === input.entryEventId) {
        score += 100;
      }
      if (level === 'PRIMARY') {
        score += 30;
      }
      if (horizon === 'ONGOING') {
        score += 16;
      } else if (horizon === 'PAST') {
        score += 8;
      }
      if (refs.includes(input.turn.agentId)) {
        score += 12;
      }
      if (refs.includes(input.turn.playerId)) {
        score += 10;
      }
      return {
        event,
        score,
        updatedAt: toTimestampMs(event.updatedAt || event.createdAt),
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      if (right.updatedAt !== left.updatedAt) {
        return right.updatedAt - left.updatedAt;
      }
      return toString(left.event.id).localeCompare(toString(right.event.id));
    })
    .map((item) => item.event);
  return rows.slice(0, 10);
}

function selectFutureEvents(input: {
  worldEvents: Array<Record<string, unknown>>;
  turn: NarrativeTurnInputNormalized;
}): Array<Record<string, unknown>> {
  const rows = input.worldEvents
    .filter((event) => toString(event.eventHorizon).toUpperCase() === 'FUTURE')
    .map((event) => {
      const refs = toStringArray(event.characterRefs);
      let score = 0;
      if (toString(event.level).toUpperCase() === 'PRIMARY') {
        score += 20;
      }
      if (refs.includes(input.turn.agentId)) {
        score += 12;
      }
      if (refs.includes(input.turn.playerId)) {
        score += 10;
      }
      return {
        event,
        score,
        updatedAt: toTimestampMs(event.updatedAt || event.createdAt),
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      if (right.updatedAt !== left.updatedAt) {
        return right.updatedAt - left.updatedAt;
      }
      return toString(left.event.id).localeCompare(toString(right.event.id));
    })
    .map((item) => item.event);
  return rows.slice(0, 6);
}

function extractKeywordCandidates(input: {
  turn: NarrativeTurnInputNormalized;
  snapshot: NarrativeContextSnapshot;
  timelineEvents: Array<Record<string, unknown>>;
}): string[] {
  const candidates: string[] = [];
  candidates.push(...input.snapshot.openThreads);
  candidates.push(input.snapshot.place);
  candidates.push(input.turn.userMessage);
  for (const event of input.timelineEvents.slice(0, 4)) {
    candidates.push(toString(event.title || event.name));
    candidates.push(toString(event.summary || event.description || event.process));
  }

  const tokens: string[] = [];
  for (const candidate of candidates) {
    const trimmed = normalizeWhitespace(candidate);
    if (!trimmed) {
      continue;
    }
    tokens.push(trimmed);
    for (const piece of trimmed.split(/[\s,，。；;：:、|/]+/g)) {
      const token = piece.trim();
      if (token.length >= 2) {
        tokens.push(token);
      }
    }
  }
  return uniqueStrings(tokens).slice(0, 24);
}

function selectLorebooks(input: {
  worldLorebooks: Array<Record<string, unknown>>;
  turn: NarrativeTurnInputNormalized;
  snapshot: NarrativeContextSnapshot;
  timelineEvents: Array<Record<string, unknown>>;
}): Array<Record<string, unknown>> {
  const keywordCandidates = extractKeywordCandidates({
    turn: input.turn,
    snapshot: input.snapshot,
    timelineEvents: input.timelineEvents,
  }).map((item) => item.toLowerCase());

  const scored = input.worldLorebooks
    .map((lorebook) => {
      const haystack = normalizeWhitespace([
        toString(lorebook.key),
        toString(lorebook.title),
        toString(lorebook.summary),
        toString(lorebook.content),
      ].join(' ')).slice(0, 900).toLowerCase();
      let score = 0;
      if (Boolean(lorebook.constant)) {
        score += 20;
      }
      for (const keyword of keywordCandidates) {
        if (keyword && haystack.includes(keyword)) {
          score += 3;
        }
      }
      return {
        lorebook,
        score,
        updatedAt: toTimestampMs(lorebook.updatedAt || lorebook.createdAt),
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      if (right.updatedAt !== left.updatedAt) {
        return right.updatedAt - left.updatedAt;
      }
      return toString(left.lorebook.id).localeCompare(toString(right.lorebook.id));
    });

  const constants = scored.filter((item) => Boolean(item.lorebook.constant)).slice(0, 4);
  const matched = scored.filter((item) => item.score > 0 && !Boolean(item.lorebook.constant)).slice(0, 8);
  const fallback = scored.slice(0, 8);
  const selected = constants.length + matched.length > 0
    ? [...constants, ...matched]
    : fallback;
  const ids = new Set<string>();
  const rows: Array<Record<string, unknown>> = [];
  for (const row of selected) {
    const id = toString(row.lorebook.id || row.lorebook.key || row.lorebook.title);
    if (id && ids.has(id)) {
      continue;
    }
    if (id) {
      ids.add(id);
    }
    rows.push(row.lorebook);
    if (rows.length >= 12) {
      break;
    }
  }
  return rows;
}

function selectScenes(input: {
  worldScenes: Array<Record<string, unknown>>;
  selectedScene: Record<string, unknown> | null;
  timelineEvents: Array<Record<string, unknown>>;
  futureEvents: Array<Record<string, unknown>>;
}): Array<Record<string, unknown>> {
  const sceneById = new Map<string, Record<string, unknown>>();
  for (const scene of input.worldScenes) {
    const id = toString(scene.id);
    if (id) {
      sceneById.set(id, scene);
    }
  }

  const orderedIds: string[] = [];
  const pushSceneId = (id: string) => {
    const normalized = toString(id);
    if (!normalized) {
      return;
    }
    if (!sceneById.has(normalized)) {
      return;
    }
    if (orderedIds.includes(normalized)) {
      return;
    }
    orderedIds.push(normalized);
  };

  pushSceneId(toString(input.selectedScene?.id));
  const projectedEvents = [...input.timelineEvents, ...input.futureEvents];
  for (const event of projectedEvents) {
    for (const ref of toStringArray(event.locationRefs)) {
      pushSceneId(ref);
    }
  }
  for (const scene of input.worldScenes) {
    pushSceneId(toString(scene.id));
    if (orderedIds.length >= 4) {
      break;
    }
  }

  const rows: Array<Record<string, unknown>> = [];
  for (const id of orderedIds) {
    const row = sceneById.get(id);
    if (row) {
      rows.push(row);
    }
    if (rows.length >= 4) {
      break;
    }
  }
  return rows;
}

function selectRelationRows(input: {
  snapshot: NarrativeContextSnapshot;
  resolvedScopes: NarrativeContextScopes;
}): Array<Record<string, unknown>> {
  if (input.snapshot.characterRelations.length > 0) {
    return input.snapshot.characterRelations.slice(0, 8);
  }
  const relationScope = asRecord(input.resolvedScopes.RELATION);
  if (Object.keys(relationScope).length > 0) {
    return [relationScope];
  }
  return [];
}

function countMemoryItems(memoryRecall: Record<string, unknown>): number {
  const rows: unknown[] = [
    memoryRecall.items,
    memoryRecall.core,
    memoryRecall.e2e,
    memoryRecall.memories,
    memoryRecall.rows,
    memoryRecall.data,
  ];
  const count = rows.reduce<number>((sum, row) => (
    sum + (Array.isArray(row) ? row.length : 0)
  ), 0);
  if (count > 0) {
    return count;
  }
  return Object.keys(memoryRecall).length > 0 ? 1 : 0;
}

function extractMemorySnippets(memoryRecall: Record<string, unknown>): string[] {
  const snippets: string[] = [];

  const collect = (value: unknown) => {
    if (value == null) {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => collect(item));
      return;
    }
    if (typeof value === 'object') {
      const record = asRecord(value);
      const content = clipText(
        record.content
        || record.text
        || record.summary
        || record.memory
        || record.fact
        || record.value,
        160,
      );
      if (content) {
        snippets.push(content);
      }
      return;
    }
    const text = clipText(value, 160);
    if (text) {
      snippets.push(text);
    }
  };

  collect(memoryRecall.items);
  collect(memoryRecall.core);
  collect(memoryRecall.e2e);
  collect(memoryRecall.memories);
  collect(memoryRecall.rows);
  collect(memoryRecall.data);

  if (snippets.length === 0 && Object.keys(memoryRecall).length > 0) {
    snippets.push(clipJson(memoryRecall, 180));
  }
  return uniqueStrings(snippets).slice(0, 10);
}

function formatEventLine(event: Record<string, unknown>): string {
  const id = toString(event.id || event.eventId || 'event');
  const level = toString(event.level || 'PRIMARY').toUpperCase();
  const horizon = toString(event.eventHorizon || 'ONGOING').toUpperCase();
  const title = clipText(event.title || event.name || id, 80);
  const summary = clipText(event.summary || event.description || event.process, 140);
  const result = clipText(event.result, 90);
  const characterRefs = toStringArray(event.characterRefs).slice(0, 5).join(',');
  const locationRefs = toStringArray(event.locationRefs).slice(0, 4).join(',');

  const details = [
    `[${level}/${horizon}]`,
    `${id}: ${title}`,
    summary ? `summary=${summary}` : '',
    result ? `result=${result}` : '',
    characterRefs ? `characters=${characterRefs}` : '',
    locationRefs ? `locations=${locationRefs}` : '',
  ].filter(Boolean);
  return details.join(' | ');
}

function formatLorebookLine(lorebook: Record<string, unknown>): string {
  const id = toString(lorebook.key || lorebook.id || lorebook.title || 'lorebook');
  const title = clipText(lorebook.title || lorebook.key || lorebook.id, 70);
  const summary = clipText(lorebook.summary || lorebook.description || lorebook.content, 180);
  const constantTag = Boolean(lorebook.constant) ? '[constant]' : '[dynamic]';
  return `${constantTag} ${id}${title ? ` (${title})` : ''} :: ${summary || '(empty)'}`;
}

function formatSceneLine(scene: Record<string, unknown>): string {
  const id = toString(scene.id || scene.sceneId || 'scene');
  const name = clipText(scene.name || scene.title || id, 64);
  const description = clipText(scene.description || asRecord(scene.setting).atmosphere, 150);
  const activeEntities = toStringArray(scene.activeEntities).slice(0, 6).join(',');
  return `${id}: ${name}${description ? ` | ${description}` : ''}${activeEntities ? ` | entities=${activeEntities}` : ''}`;
}

function formatRelationLine(relation: Record<string, unknown>): string {
  const subjectId = toString(relation.subjectId || relation.sourceId || relation.sourceLabel);
  const targetId = toString(relation.targetSubjectId || relation.targetId || relation.targetLabel);
  const relationType = clipText(
    relation.relationType
    || asRecord(relation.relationContract).relationType
    || asRecord(relation.narrativeSetting).relationType
    || asRecord(relation.narrativeState).relationType,
    60,
  );
  const detail = clipText(
    relation.detail
    || relation.summary
    || relation.description
    || clipJson(relation, 180),
    180,
  );
  return `${subjectId || '(subject)'} -> ${targetId || '(target)'}${relationType ? ` [${relationType}]` : ''} :: ${detail}`;
}

function formatFutureNoteLine(event: Record<string, unknown>): string {
  const title = clipText(event.title || event.name || event.id, 80) || '(untitled)';
  const pressure = clipText(event.summary || event.description || event.process, 120);
  const consequence = clipText(event.result, 80);
  return [
    `[hidden-note] ${title}`,
    pressure ? `pressure=${pressure}` : '',
    consequence ? `possible-consequence=${consequence}` : '',
  ].filter(Boolean).join(' | ');
}

function eventNarrativeText(event: Record<string, unknown>): string {
  return normalizeWhitespace([
    toString(event.title || event.name),
    toString(event.summary || event.description || event.process),
    toString(event.result),
  ].join(' ')).toLowerCase();
}

function hasActionSignal(text: string): boolean {
  if (!text) {
    return false;
  }
  return /(attack|retreat|reveal|discover|decide|move|trigger|冲|杀|战|破|撤|突|追|逃|揭|现|决|转移|引爆|反击|围攻|封锁)/i.test(text);
}

function hasEscalationSignal(text: string): boolean {
  if (!text) {
    return false;
  }
  return /(crisis|collapse|deadline|siege|injury|fatal|urgent|危机|失控|崩|迫近|倒计时|重伤|灭|围城|逼近|绝境)/i.test(text);
}

type SpineEventLike = {
  type?: string;
  [key: string]: unknown;
};

function buildAdvanceHints(input: {
  turn: NarrativeTurnInputNormalized;
  snapshot: NarrativeContextSnapshot;
  timelineEvents: Array<Record<string, unknown>>;
  futureEvents: Array<Record<string, unknown>>;
  recentSpineEvents?: SpineEventLike[];
}): string[] {
  const hints: string[] = [];
  const recentTimeline = input.timelineEvents.slice(0, 6);
  const recentTexts = recentTimeline.map(eventNarrativeText).filter(Boolean);
  const actionCount = recentTexts.filter((text) => hasActionSignal(text)).length;
  const escalationCount = recentTexts.filter((text) => hasEscalationSignal(text)).length;

  if (recentTexts.length >= 4 && actionCount === 0) {
    hints.push('P2 low_action_plateau: Inject at least one concrete ACTION/DECISION/DISCOVERY beat this turn.');
  }

  if (input.snapshot.tensionTarget >= 0.6 && recentTexts.length >= 3 && escalationCount === 0) {
    hints.push('P2 tension_stagnation: Target tension is high; add pressure/escalation without instant resolution.');
  }

  if (input.snapshot.openThreads.length > 0) {
    hints.push(`P2 unresolved_threads: Keep at least one thread unresolved -> ${input.snapshot.openThreads.slice(0, 3).map((item) => clipText(item, 70)).join(' | ')}`);
  }

  if (input.futureEvents.length > 0) {
    hints.push('P2 anti-spoiler: Future notes are hidden; only foreshadow via atmosphere or NPC behavior.');
  }

  if (input.turn.triggerSource === 'AgentInitiative' && input.snapshot.openThreads.length === 0) {
    hints.push('P3 initiative_guard: No open thread; prefer subtle world pressure over hard plot leap.');
  }

  // Spine-history-based rhythm hints
  const spine = Array.isArray(input.recentSpineEvents) ? input.recentSpineEvents : [];
  if (spine.length >= 5) {
    const last5 = spine.slice(-5);
    const typeCounts = new Map<string, number>();
    for (const event of last5) {
      const eventType = toString(event.type || 'scene-beat');
      typeCounts.set(eventType, (typeCounts.get(eventType) || 0) + 1);
    }
    for (const [eventType, count] of typeCounts) {
      if (count >= 3) {
        hints.push(`P2 rhythm_monotony: Last 5 spine events have ${count}x "${eventType}"; vary event types for narrative rhythm.`);
        break;
      }
    }
    const dialogueCount = typeCounts.get('dialogue') || 0;
    if (dialogueCount >= 4) {
      hints.push('P2 dialogue_stagnation: 4+ of last 5 spine events are dialogue; inject action, observation, or scene-beat.');
    }
  }

  return uniqueStrings(hints).slice(0, 8);
}

function buildCompiledPromptContext(input: {
  turn: NarrativeTurnInputNormalized;
  snapshot: NarrativeContextSnapshot;
  routeOptions: NarrativeRouteOptionsSnapshot;
  resolvedScopes: NarrativeContextScopes;
  timelineEvents: Array<Record<string, unknown>>;
  futureEvents: Array<Record<string, unknown>>;
  advanceHints: string[];
  lorebooks: Array<Record<string, unknown>>;
  scenes: Array<Record<string, unknown>>;
  relations: Array<Record<string, unknown>>;
  memories: string[];
  sourceCounts: NarrativePromptStats['sourceCounts'];
}): {
  compiledPrompt: string;
  promptStats: NarrativePromptStats;
} {
  const storyStateLines = [
    `phase=${input.snapshot.phase}`,
    `objective=${input.snapshot.objective}`,
    `tensionTarget=${String(input.snapshot.tensionTarget)}`,
    `openThreads=${input.snapshot.openThreads.join(' | ') || '(none)'}`,
  ];

  const sectionEntries: Array<[string, string]> = [
    ['coordinates', [
      `storyId=${input.turn.storyId}`,
      `worldId=${input.turn.worldId}`,
      `agentId=${input.turn.agentId}`,
      `playerId=${input.turn.playerId}`,
      `triggerSource=${input.turn.triggerSource}`,
    ].join('\n')],
    ['route', [
      `source=${toString(input.routeOptions.selected.source || 'unknown')}`,
      `model=${toString(input.routeOptions.selected.model || 'unknown')}`,
      `connectorId=${toString(input.routeOptions.selected.connectorId || 'unknown')}`,
    ].join('\n')],
    ['story-state', storyStateLines.join('\n')],
    ['scene-anchor', [
      `place=${input.snapshot.place}`,
      `sceneMaterial=${input.snapshot.sceneMaterial.slice(0, 8).map((item) => clipText(item, 110)).join(' | ') || '(none)'}`,
      `availableActors=${input.snapshot.availableActors.slice(0, 16).join(' | ') || '(none)'}`,
      `futurePressure=${input.snapshot.futurePressure.slice(0, 8).map((item) => clipText(item, 90)).join(' | ') || '(none)'}`,
    ].join('\n')],
    ['timeline-events', input.timelineEvents.length > 0
      ? input.timelineEvents.map((event, index) => `${index + 1}. ${formatEventLine(event)}`).join('\n')
      : '(none)'],
    ['future-foreshadowing-hidden-notes', input.futureEvents.length > 0
      ? [
        'IMPORTANT: Future events below are hidden author notes. Never narrate them as established facts.',
        'Only use subtle foreshadowing through atmosphere, pacing pressure, or NPC behavior.',
        ...input.futureEvents.map((event, index) => `${index + 1}. ${formatFutureNoteLine(event)}`),
      ].join('\n')
      : '(none)'],
    ['advance-hints', input.advanceHints.length > 0
      ? input.advanceHints.map((hint, index) => `${index + 1}. ${hint}`).join('\n')
      : '(none)'],
    ['world-lorebooks', input.lorebooks.length > 0
      ? input.lorebooks.map((lorebook, index) => `${index + 1}. ${formatLorebookLine(lorebook)}`).join('\n')
      : '(none)'],
    ['scene-options', input.scenes.length > 0
      ? input.scenes.map((scene, index) => `${index + 1}. ${formatSceneLine(scene)}`).join('\n')
      : '(none)'],
    ['relation-hints', input.relations.length > 0
      ? input.relations.map((relation, index) => `${index + 1}. ${formatRelationLine(relation)}`).join('\n')
      : '(none)'],
    ['memory-recall', input.memories.length > 0
      ? input.memories.map((memory, index) => `${index + 1}. ${clipText(memory, 180)}`).join('\n')
      : '(none)'],
    ['context-scopes', [
      `CANON=${clipJson(input.resolvedScopes.CANON, 280) || '{}'}`,
      `STORY=${clipJson(input.resolvedScopes.STORY, 280) || '{}'}`,
      `SUBJECT=${clipJson(input.resolvedScopes.SUBJECT, 220) || '{}'}`,
      `RELATION=${clipJson(input.resolvedScopes.RELATION, 220) || '{}'}`,
    ].join('\n')],
    ['trigger-context', [
      `userMessage=${clipText(input.turn.userMessage, 260) || '(empty)'}`,
      `systemContext=${clipJson(input.turn.systemContext, 260) || '{}'}`,
      `contextCoverage=${clipJson(input.snapshot.contextCoverage, 200)}`,
    ].join('\n')],
  ];

  const compiledPrompt = sectionEntries
    .map(([section, body]) => `## ${section}\n${body}`)
    .join('\n\n');

  const sectionChars: Record<string, number> = {};
  for (const [section, body] of sectionEntries) {
    sectionChars[section] = body.length;
  }

  return {
    compiledPrompt,
    promptStats: {
      sectionChars,
      totalPromptChars: compiledPrompt.length,
      sourceCounts: input.sourceCounts,
      selectedCounts: {
        timelineEvents: input.timelineEvents.length,
        futureEvents: input.futureEvents.length,
        advanceHints: input.advanceHints.length,
        lorebooks: input.lorebooks.length,
        scenes: input.scenes.length,
        relations: input.relations.length,
        memories: input.memories.length,
      },
    },
  };
}

export async function runNarrativeStep1Assembly(input: {
  turn: NarrativeTurnInputNormalized;
  queryWorldEvents: () => Promise<unknown>;
  queryWorldLorebooks: () => Promise<unknown>;
  queryWorldScenes: () => Promise<unknown>;
  queryNarrativeContexts: () => Promise<unknown>;
  queryAgentMemoryRecall: () => Promise<unknown>;
  recentSpineEvents?: SpineEventLike[];
}): Promise<NarrativeStepResult<NarrativeStep1AssemblyResult>> {
  try {
    const [
      worldEventsPayload,
      worldLorebooksPayload,
      worldScenesPayload,
      narrativeContextsPayload,
      memoryRecallPayload,
    ] = await Promise.all([
      input.queryWorldEvents(),
      input.queryWorldLorebooks(),
      input.queryWorldScenes(),
      input.queryNarrativeContexts(),
      input.queryAgentMemoryRecall().catch(() => ({
        items: [],
        core: [],
        e2e: [],
        recallSource: 'unavailable',
      })),
    ]);

    const worldEvents = toRecordArray(worldEventsPayload);
    const worldLorebooks = toRecordArray(worldLorebooksPayload);
    const worldScenes = toRecordArray(worldScenesPayload);
    const narrativeContexts = toRecordArray(narrativeContextsPayload);
    const memoryRecall = asRecord(memoryRecallPayload);
    const routeOptions = toNarrativeRouteOptions(input.turn);

    const resolved = resolveNarrativeScopes({
      rows: narrativeContexts,
      turn: input.turn,
    });

    const scene = resolveScene({
      worldScenes,
      worldEvents,
      storyScope: resolved.scopes.STORY,
    });
    if (!scene) {
      resolved.coverage.warnings.push('NARRATIVE_CONTEXT_SCENE_MISSING_WARN');
    }
    resolved.coverage.scene = Boolean(scene);

    const phase = toString(resolved.scopes.STORY.phase || asRecord(resolved.scopes.STORY.narrativeState).phase)
      || 'opening';
    const objective = toString(
      resolved.scopes.STORY.objective
      || asRecord(resolved.scopes.STORY.narrativeState).objective,
    ) || 'advance-story';
    const tensionTarget = toNumber(
      resolved.scopes.STORY.tension
      || asRecord(resolved.scopes.STORY.narrativeState).tension,
      0.5,
    );
    const openThreads = toStringArray(
      resolved.scopes.STORY.openThreads
      || asRecord(resolved.scopes.STORY.narrativeState).openThreads,
    );
    const startupPolicy = {
      initiative: asRecord(
        resolved.scopes.STORY.initiativePolicy
        || asRecord(resolved.scopes.STORY.narrativeSetting).initiativePolicy,
      ),
      pacing: asRecord(
        resolved.scopes.STORY.pacingPolicy
        || asRecord(resolved.scopes.STORY.narrativeSetting).pacingPolicy,
      ),
    };

    const place = toString(scene?.name)
      || toString(asRecord(resolved.scopes.STORY.narrativeSetting).location)
      || `world:${input.turn.worldId}`;
    const sceneMaterial = extractSceneMaterial({
      worldEvents,
      storyScope: resolved.scopes.STORY,
      scene,
    });

    const snapshot: NarrativeContextSnapshot = {
      place,
      worldviewRules: extractWorldviewRules(worldLorebooks),
      sceneMaterial,
      availableActors: extractActors({
        worldEvents,
        scene,
        turn: input.turn,
      }),
      narrativeStyle: {
        ...asRecord(resolved.scopes.CANON),
        routeCapability: input.turn.capability,
        routeSource: toString(routeOptions.selected.source),
        routeModel: toString(routeOptions.selected.model),
      },
      characterRelations: extractCharacterRelations(resolved.scopes),
      phase,
      objective,
      tensionTarget: Math.max(0, Math.min(1, tensionTarget)),
      openThreads: uniqueStrings(openThreads).slice(0, 20),
      startupPolicy,
      futurePressure: extractFuturePressure(worldEvents),
      contextCoverage: resolved.coverage,
      narrativeContextScopes: resolved.scopes,
    };

    const snapshotCheck = NarrativeContextSnapshotSchema.safeParse(snapshot);
    if (!snapshotCheck.success || !hasSufficientContext(snapshot)) {
      return {
        ok: false,
        reasonCode: NARRATIVE_REASON_CODES.NARRATIVE_CONTEXT_INSUFFICIENT,
        actionHint: 'Complete CANON/STORY contexts and retry.',
        value: null,
      };
    }

    const entryEventId = extractStoryEntryEventId(input.turn.storyId);
    const timelineEvents = selectTimelineEvents({
      worldEvents,
      turn: input.turn,
      entryEventId,
    });
    const futureEvents = selectFutureEvents({
      worldEvents,
      turn: input.turn,
    });
    const advanceHints = buildAdvanceHints({
      turn: input.turn,
      snapshot,
      timelineEvents,
      futureEvents,
      recentSpineEvents: input.recentSpineEvents,
    });
    const lorebooks = selectLorebooks({
      worldLorebooks,
      turn: input.turn,
      snapshot,
      timelineEvents,
    });
    const scenes = selectScenes({
      worldScenes,
      selectedScene: scene,
      timelineEvents,
      futureEvents,
    });
    const relations = selectRelationRows({
      snapshot,
      resolvedScopes: resolved.scopes,
    });
    const memories = extractMemorySnippets(memoryRecall);

    const sourceCounts: NarrativePromptStats['sourceCounts'] = {
      worldEvents: worldEvents.length,
      worldLorebooks: worldLorebooks.length,
      worldScenes: worldScenes.length,
      narrativeContexts: narrativeContexts.length,
      memoryItems: countMemoryItems(memoryRecall),
    };
    const compiled = buildCompiledPromptContext({
      turn: input.turn,
      snapshot,
      routeOptions,
      resolvedScopes: resolved.scopes,
      timelineEvents,
      futureEvents,
      advanceHints,
      lorebooks,
      scenes,
      relations,
      memories,
      sourceCounts,
    });

    const assets: NarrativeAssemblyAssets = {
      routeOptions,
      compiledPrompt: compiled.compiledPrompt,
      promptStats: compiled.promptStats,
    };

    return {
      ok: true,
      reasonCode: null,
      actionHint: 'step1-assembly-passed',
      value: {
        snapshot,
        assets,
      },
    };
  } catch {
    return {
      ok: false,
      reasonCode: NARRATIVE_REASON_CODES.NARRATIVE_CONTEXT_INSUFFICIENT,
      actionHint: 'Complete CANON/STORY contexts and retry.',
      value: null,
    };
  }
}
