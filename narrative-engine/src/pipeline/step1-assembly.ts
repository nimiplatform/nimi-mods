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
  memoryRecall: Record<string, unknown>;
};

export type NarrativeStep1AssemblyResult = {
  snapshot: NarrativeContextSnapshot;
  assets: NarrativeAssemblyAssets;
};

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
  return uniqueStrings(rules).slice(0, 40);
}

function extractSceneMaterial(worldEvents: Array<Record<string, unknown>>): string[] {
  const materials: string[] = [];
  for (const event of worldEvents) {
    const title = toString(event.title || event.name);
    const summary = toString(event.summary || event.description || event.process);
    const cause = toString(event.cause);
    const result = toString(event.result);
    if (title) materials.push(title);
    if (summary) materials.push(summary);
    if (cause) materials.push(cause);
    if (result) materials.push(result);
  }
  return uniqueStrings(materials).slice(0, 60);
}

function extractActors(worldEvents: Array<Record<string, unknown>>, input: NarrativeTurnInputNormalized): string[] {
  const actors: string[] = [input.agentId, input.playerId];
  for (const event of worldEvents) {
    const fields = [
      ...toStringArray(event.characterRefs),
      ...toStringArray(event.actors),
    ];
    fields.forEach((field) => actors.push(field));
  }
  return uniqueStrings(actors).slice(0, 20);
}

function extractPlace(worldLorebooks: Array<Record<string, unknown>>, input: NarrativeTurnInputNormalized): string {
  for (const lorebook of worldLorebooks) {
    const key = toString(lorebook.key || lorebook.id || lorebook.title).toLowerCase();
    if (!key.includes('place') && !key.includes('location') && !key.includes('scene')) {
      continue;
    }
    const content = toString(lorebook.content || lorebook.summary || lorebook.description || lorebook.value);
    if (content) {
      return content;
    }
  }
  return `world:${input.worldId}`;
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
  return [];
}

function hasSufficientContext(snapshot: NarrativeContextSnapshot): boolean {
  if (!snapshot.place) {
    return false;
  }
  if (snapshot.worldviewRules.length === 0 && snapshot.sceneMaterial.length === 0) {
    return false;
  }
  const scopes = snapshot.narrativeContextScopes;
  const hasScopedPayload = Object.keys(scopes.CANON).length > 0
    || Object.keys(scopes.STORY).length > 0
    || Object.keys(scopes.SUBJECT).length > 0
    || Object.keys(scopes.RELATION).length > 0;
  return hasScopedPayload;
}

export async function runNarrativeStep1Assembly(input: {
  turn: NarrativeTurnInputNormalized;
  queryRuntimeRouteOptions: () => Promise<unknown>;
  queryWorldEvents: () => Promise<unknown>;
  queryWorldLorebooks: () => Promise<unknown>;
  queryAgentMemoryRecall: () => Promise<unknown>;
  resolveNarrativeContext: () => NarrativeContextScopes;
}): Promise<NarrativeStepResult<NarrativeStep1AssemblyResult>> {
  try {
    const [routePayload, worldEventsPayload, worldLorebooksPayload, memoryRecallPayload] = await Promise.all([
      input.queryRuntimeRouteOptions(),
      input.queryWorldEvents(),
      input.queryWorldLorebooks(),
      input.queryAgentMemoryRecall(),
    ]);

    const worldEvents = toRecordArray(worldEventsPayload);
    const worldLorebooks = toRecordArray(worldLorebooksPayload);
    const memoryRecall = asRecord(memoryRecallPayload);
    const narrativeContextScopes = input.resolveNarrativeContext();
    const routePayloadRecord = asRecord(routePayload);
    const routePayloadSelected = asRecord(routePayloadRecord.selected);

    const snapshot: NarrativeContextSnapshot = {
      place: extractPlace(worldLorebooks, input.turn),
      worldviewRules: extractWorldviewRules(worldLorebooks),
      sceneMaterial: extractSceneMaterial(worldEvents),
      availableActors: extractActors(worldEvents, input.turn),
      narrativeStyle: {
        ...asRecord(narrativeContextScopes.CANON),
        routeSource: toString(routePayloadSelected.source || routePayloadRecord.source),
        routeModel: toString(routePayloadSelected.model || routePayloadRecord.model),
      },
      characterRelations: extractCharacterRelations(narrativeContextScopes),
      narrativeContextScopes,
    };

    const snapshotCheck = NarrativeContextSnapshotSchema.safeParse(snapshot);
    if (!snapshotCheck.success || !hasSufficientContext(snapshot)) {
      return {
        ok: false,
        reasonCode: NARRATIVE_REASON_CODES.NARRATIVE_CONTEXT_INSUFFICIENT,
        actionHint: 'Complete required context scopes and retry.',
        value: null,
      };
    }

    const assets: NarrativeAssemblyAssets = {
      routeOptions: toNarrativeRouteOptions(routePayload),
      worldEvents,
      worldLorebooks,
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
      actionHint: 'Complete required context scopes and retry.',
      value: null,
    };
  }
}
