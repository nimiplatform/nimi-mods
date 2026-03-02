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

type NarrativeAssemblyAssets = {
  routeOptions: NarrativeRouteOptionsSnapshot;
  worldEvents: Array<Record<string, unknown>>;
  worldLorebooks: Array<Record<string, unknown>>;
  worldScenes: Array<Record<string, unknown>>;
  narrativeContexts: Array<Record<string, unknown>>;
  memoryRecall: Record<string, unknown>;
};

export type NarrativeStep1AssemblyResult = {
  snapshot: NarrativeContextSnapshot;
  assets: NarrativeAssemblyAssets;
};

function toString(value: unknown): string {
  return String(value || '').trim();
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

function toNarrativeRouteOptions(value: unknown): NarrativeRouteOptionsSnapshot {
  const record = asRecord(value);
  const selected = asRecord(record.selected);
  return {
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
  return ordered[0]?.row || null;
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
  const story = pickLatestScopeRow({
    rows: input.rows,
    scope: 'STORY',
    score: (row) => (toString(row.storyId) === input.turn.storyId ? 1 : 0),
  });
  const subject = pickLatestScopeRow({
    rows: input.rows,
    scope: 'SUBJECT',
    score: (row) => (toString(row.subjectId) === input.turn.agentId ? 1 : 0),
  });
  const relation = pickLatestScopeRow({
    rows: input.rows,
    scope: 'RELATION',
    score: (row) => {
      const subjectId = toString(row.subjectId);
      const targetSubjectId = toString(row.targetSubjectId);
      const direct = subjectId === input.turn.agentId && targetSubjectId === input.turn.playerId;
      const reverse = subjectId === input.turn.playerId && targetSubjectId === input.turn.agentId;
      return direct || reverse ? 1 : 0;
    },
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

export async function runNarrativeStep1Assembly(input: {
  turn: NarrativeTurnInputNormalized;
  queryRuntimeRouteOptions: () => Promise<unknown>;
  queryWorldEvents: () => Promise<unknown>;
  queryWorldLorebooks: () => Promise<unknown>;
  queryWorldScenes: () => Promise<unknown>;
  queryNarrativeContexts: () => Promise<unknown>;
  queryAgentMemoryRecall: () => Promise<unknown>;
}): Promise<NarrativeStepResult<NarrativeStep1AssemblyResult>> {
  try {
    const [
      routePayload,
      worldEventsPayload,
      worldLorebooksPayload,
      worldScenesPayload,
      narrativeContextsPayload,
      memoryRecallPayload,
    ] = await Promise.all([
      input.queryRuntimeRouteOptions(),
      input.queryWorldEvents(),
      input.queryWorldLorebooks(),
      input.queryWorldScenes(),
      input.queryNarrativeContexts(),
      input.queryAgentMemoryRecall(),
    ]);

    const worldEvents = toRecordArray(worldEventsPayload);
    const worldLorebooks = toRecordArray(worldLorebooksPayload);
    const worldScenes = toRecordArray(worldScenesPayload);
    const narrativeContexts = toRecordArray(narrativeContextsPayload);
    const memoryRecall = asRecord(memoryRecallPayload);

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

    const routePayloadRecord = asRecord(routePayload);
    const routePayloadSelected = asRecord(routePayloadRecord.selected);
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
        routeSource: toString(routePayloadSelected.source || routePayloadRecord.source),
        routeModel: toString(routePayloadSelected.model || routePayloadRecord.model),
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

    const assets: NarrativeAssemblyAssets = {
      routeOptions: toNarrativeRouteOptions(routePayload),
      worldEvents,
      worldLorebooks,
      worldScenes,
      narrativeContexts,
      memoryRecall,
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
