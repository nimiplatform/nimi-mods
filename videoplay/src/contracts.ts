export const VIDEOPLAY_MOD_ID = 'world.nimi.videoplay';
export const VIDEOPLAY_TAB_ID = 'mod:videoplay';

export const VIDEOPLAY_NAV_SLOT = 'ui-extension.app.sidebar.mods';
export const VIDEOPLAY_ROUTE_SLOT = 'ui-extension.app.content.routes';

export const VIDEOPLAY_DATA_API_RUNTIME_ROUTE_OPTIONS = 'data-api.runtime.route.options';
export const VIDEOPLAY_DATA_API_WORLD_EVENTS_LIST = 'data-api.world.events.list';
export const VIDEOPLAY_DATA_API_WORLD_LOREBOOKS_LIST = 'data-api.world.lorebooks.list';
export const VIDEOPLAY_DATA_API_WORLD_SCENES_LIST = 'data-api.world.scenes.list';
export const VIDEOPLAY_DATA_API_WORLD_NARRATIVE_CONTEXTS_LIST = 'data-api.world.narrative-contexts.list';
export const VIDEOPLAY_DATA_API_CORE_AGENT_MEMORY_RECALL_FOR_ENTITY = 'data-api.core.agent.memory.recall.for-entity';

export const VIDEOPLAY_DATA_API_EPISODE_UPSERT = 'data-api.videoplay.episode.upsert';
export const VIDEOPLAY_DATA_API_ASSET_BATCH_UPSERT = 'data-api.videoplay.asset.batch-upsert';
export const VIDEOPLAY_DATA_API_RELEASE_PUBLISH = 'data-api.videoplay.release.publish';

export const VIDEOPLAY_CAPABILITIES = [
  'llm.text.generate',
  'llm.image.generate',
  'llm.video.generate',
  'llm.speech.synthesize',
  `data.query.${VIDEOPLAY_DATA_API_RUNTIME_ROUTE_OPTIONS}`,
  `data.query.${VIDEOPLAY_DATA_API_WORLD_EVENTS_LIST}`,
  `data.query.${VIDEOPLAY_DATA_API_WORLD_LOREBOOKS_LIST}`,
  `data.query.${VIDEOPLAY_DATA_API_WORLD_SCENES_LIST}`,
  `data.query.${VIDEOPLAY_DATA_API_WORLD_NARRATIVE_CONTEXTS_LIST}`,
  `data.query.${VIDEOPLAY_DATA_API_CORE_AGENT_MEMORY_RECALL_FOR_ENTITY}`,
  `data.register.${VIDEOPLAY_DATA_API_EPISODE_UPSERT}`,
  `data.query.${VIDEOPLAY_DATA_API_EPISODE_UPSERT}`,
  `data.register.${VIDEOPLAY_DATA_API_ASSET_BATCH_UPSERT}`,
  `data.query.${VIDEOPLAY_DATA_API_ASSET_BATCH_UPSERT}`,
  `data.register.${VIDEOPLAY_DATA_API_RELEASE_PUBLISH}`,
  `data.query.${VIDEOPLAY_DATA_API_RELEASE_PUBLISH}`,
  `ui.register.${VIDEOPLAY_NAV_SLOT}`,
  `ui.register.${VIDEOPLAY_ROUTE_SLOT}`,
] as const;

export const VIDEOPLAY_REASON = {
  INPUT_INVALID: 'VIDEOPLAY_INPUT_INVALID',
  FACT_PROJECTION_INVALID: 'VIDEOPLAY_FACT_PROJECTION_INVALID',
  STORY_PACKAGE_INVALID: 'VIDEOPLAY_STORY_PACKAGE_INVALID',
  STORY_SOURCE_UNAVAILABLE: 'VIDEOPLAY_STORY_SOURCE_UNAVAILABLE',
  SEGMENTATION_FAILED: 'VIDEOPLAY_EPISODE_SEGMENTATION_FAILED',
  SEGMENTATION_NON_DETERMINISTIC: 'VIDEOPLAY_EPISODE_SEGMENTATION_NON_DETERMINISTIC',
  SCREENPLAY_SCHEMA_INVALID: 'VIDEOPLAY_SCREENPLAY_SCHEMA_INVALID',
  STORYBOARD_SCHEMA_INVALID: 'VIDEOPLAY_STORYBOARD_SCHEMA_INVALID',
  ROUTE_UNAVAILABLE: 'VIDEOPLAY_ROUTE_UNAVAILABLE',
  SHOT_RENDER_FAILED: 'VIDEOPLAY_SHOT_RENDER_FAILED',
  ASSET_ANALYSIS_INVALID: 'VIDEOPLAY_ASSET_ANALYSIS_INVALID',
  BATCH_QUEUE_ORCHESTRATION_FAILED: 'VIDEOPLAY_BATCH_QUEUE_ORCHESTRATION_FAILED',
  VOICE_RENDER_FAILED: 'VIDEOPLAY_VOICE_RENDER_FAILED',
  COVERAGE_LOW: 'VIDEOPLAY_CLIP_RENDER_COVERAGE_LOW',
  TIMELINE_SCHEMA_INVALID: 'VIDEOPLAY_TIMELINE_SCHEMA_INVALID',
  AV_SYNC_DRIFT: 'VIDEOPLAY_AUDIO_VIDEO_SYNC_DRIFT',
  EDIT_COMPOSE_FAILED: 'VIDEOPLAY_EDIT_COMPOSE_FAILED',
  VISUAL_ATTRACTION_LOW: 'VIDEOPLAY_VISUAL_ATTRACTION_LOW',
  QC_FAILED: 'VIDEOPLAY_QC_FAILED',
  RELEASE_PACKAGE_INVALID: 'VIDEOPLAY_RELEASE_PACKAGE_INVALID',
  PERSIST_WARN: 'VIDEOPLAY_PERSISTENCE_FAILED_WARN',
  RUN_CANCELED: 'VIDEOPLAY_RUN_CANCELED',
  PROMPT_CANARY_FAILED: 'VIDEOPLAY_PROMPT_CANARY_FAILED',
  CHECKPOINT_INVALID: 'VIDEOPLAY_CHECKPOINT_INVALID',
  STEP_RESUME_HASH_MISMATCH: 'VIDEOPLAY_STEP_RESUME_HASH_MISMATCH',
} as const;

export type VideoPlayReasonCode =
  typeof VIDEOPLAY_REASON[keyof typeof VIDEOPLAY_REASON];

export const VIDEOPLAY_RETRY_CLASS = {
  RETRYABLE: 'retryable',
  NON_RETRYABLE: 'non-retryable',
} as const;

export type VideoPlayRetryClass =
  typeof VIDEOPLAY_RETRY_CLASS[keyof typeof VIDEOPLAY_RETRY_CLASS];

export const VIDEOPLAY_STORAGE_KEY = 'nimi.videoplay.state.v1';

export const VIDEOPLAY_PIPELINE_CHAIN = [
  'narrative-ingest',
  'episode-segmentation',
  'screenplay',
  'storyboard',
  'asset-render',
  'edit-compose',
  'qc-gate',
  'release-package',
] as const;

export type VideoPlayPipelineStep =
  typeof VIDEOPLAY_PIPELINE_CHAIN[number];

export const VIDEOPLAY_ROUTE_STAGES = [
  'screenplay',
  'storyboard',
  'asset-render-image',
  'asset-render-video',
  'asset-render-voice',
] as const;

export const VIDEOPLAY_STAGE_CAPABILITY = {
  screenplay: 'llm.text.generate',
  storyboard: 'llm.text.generate',
  'asset-render-image': 'llm.image.generate',
  'asset-render-video': 'llm.video.generate',
  'asset-render-voice': 'llm.speech.synthesize',
} as const;

export type VideoPlayRouteStage =
  typeof VIDEOPLAY_ROUTE_STAGES[number];

export const VIDEOPLAY_STORY_SOURCE_MODE = {
  CANONICAL: 'canonical-story',
  ENRICHED: 'textplay-enriched-story',
} as const;

export type VideoStorySourceMode =
  typeof VIDEOPLAY_STORY_SOURCE_MODE[keyof typeof VIDEOPLAY_STORY_SOURCE_MODE];

export const VIDEOPLAY_PROMPT_ID = {
  STORYBOARD_PLAN: 'VPROMPT-STORYBOARD-PLAN-V1',
  SHOT_REWRITE: 'VPROMPT-SHOT-REWRITE-V1',
  SHOT_VARIANT: 'VPROMPT-SHOT-VARIANT-V1',
} as const;

export type VideoPlayPromptId =
  typeof VIDEOPLAY_PROMPT_ID[keyof typeof VIDEOPLAY_PROMPT_ID];

export const VIDEOPLAY_QUALITY_RULE = {
  GROUNDED_RATIO_MIN: 0.98,
  ASSET_COVERAGE_RATIO_MIN: 0.9,
  VOICE_COVERAGE_RATIO_MIN: 0.9,
  EPISODE_DURATION_SEC_MIN: 15,
  EPISODE_DURATION_SEC_MAX: 180,
  MAX_AV_DRIFT_MS: 80,
  MAX_BLACK_GAP_MS: 250,
  VISUAL_ATTRACTION_MIN: 0.72,
  VISUAL_COMPONENT_MIN: 0.55,
} as const;

export const VIDEOPLAY_VISUAL_COMPONENT_WEIGHT = {
  characterConsistency: 0.3,
  motionContinuity: 0.3,
  compositionReadability: 0.2,
  lightColorCoherence: 0.2,
} as const;

export const VIDEOPLAY_OPERATION_TYPE = {
  INSERT_SHOT: 'insert-shot',
  UPDATE_SHOT: 'update-shot',
  DELETE_SHOT: 'delete-shot',
  REGENERATE_SHOT: 'regenerate-shot',
  CREATE_SHOT_VARIANT: 'create-shot-variant',
  UNDO_LAST_REGENERATION: 'undo-last-regeneration',
  LINK_SHOT_TRANSITION: 'link-shot-transition',
  GENERATE_FIRST_LAST_FRAME: 'generate-first-last-frame',
  GENERATE_VOICE_LINE: 'generate-voice-line',
  APPLY_LIP_SYNC: 'apply-lip-sync',
  CREATE_BRANCH: 'create-branch',
  SWITCH_BRANCH: 'switch-branch',
  REDO: 'redo',
  MERGE_BRANCH: 'merge-branch',
} as const;

export type VideoPlayOperationType =
  typeof VIDEOPLAY_OPERATION_TYPE[keyof typeof VIDEOPLAY_OPERATION_TYPE];
