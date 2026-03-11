import {
  NARRATIVE_ENGINE_DATA_API_AUDIT_APPEND,
  NARRATIVE_ENGINE_DATA_API_CONTEXT_RESOLVE,
  NARRATIVE_ENGINE_DATA_API_PROJECTION_RENDER_INPUT,
  NARRATIVE_ENGINE_DATA_API_SPINE_APPEND,
  NARRATIVE_ENGINE_DATA_API_TURN_BY_ID,
  NARRATIVE_ENGINE_DATA_API_TURN_LATEST,
  NARRATIVE_ENGINE_DATA_API_TURN_RESULT_UPSERT,
  NARRATIVE_ENGINE_DATA_API_TURN_WINDOW,
  NARRATIVE_ENGINE_MOD_ID,
  NARRATIVE_GUARD_DEFAULTS,
  NARRATIVE_INITIATIVE_DEFAULTS,
  NARRATIVE_REASON_CODES,
} from './contracts.js';
import {
  createNarrativeEngineModule,
  type NarrativeEngineModule,
  type NarrativeEngineModuleInput,
} from './module.js';
import {
  isEventDerivedStoryId,
  pickNarrativeRelationContextRow,
  pickNarrativeStoryContextRow,
  pickNarrativeSubjectContextRow,
  resolveNarrativeContextStoryAnchor,
} from './context-anchor.js';

export {
  NARRATIVE_ENGINE_DATA_API_AUDIT_APPEND,
  NARRATIVE_ENGINE_DATA_API_CONTEXT_RESOLVE,
  NARRATIVE_ENGINE_DATA_API_PROJECTION_RENDER_INPUT,
  NARRATIVE_ENGINE_DATA_API_SPINE_APPEND,
  NARRATIVE_ENGINE_DATA_API_TURN_BY_ID,
  NARRATIVE_ENGINE_DATA_API_TURN_LATEST,
  NARRATIVE_ENGINE_DATA_API_TURN_RESULT_UPSERT,
  NARRATIVE_ENGINE_DATA_API_TURN_WINDOW,
  NARRATIVE_ENGINE_MOD_ID,
  NARRATIVE_GUARD_DEFAULTS,
  NARRATIVE_INITIATIVE_DEFAULTS,
  NARRATIVE_REASON_CODES,
  createNarrativeEngineModule,
  isEventDerivedStoryId,
  pickNarrativeRelationContextRow,
  pickNarrativeStoryContextRow,
  pickNarrativeSubjectContextRow,
  resolveNarrativeContextStoryAnchor,
};

export type {
  NarrativeEngineModule,
  NarrativeEngineModuleInput,
};

export * from './pipeline/process-turn.js';
export * from './projection/render-input.js';
export * from './store/repository.js';
export * from './types.js';
