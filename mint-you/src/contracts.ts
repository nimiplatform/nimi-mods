export const MINTYOU_MOD_ID = 'world.nimi.mint-you';

export const MINTYOU_NAV_SLOT = 'ui-extension.app.sidebar.mods';
export const MINTYOU_ROUTE_SLOT = 'ui-extension.app.content.routes';

export const MINTYOU_DATA_API_AGENTS_CREATE = 'data-api.creator.agents.create';
export const MINTYOU_DATA_API_WORLD_ACCESS_ME = 'data-api.world.access.me';
export const MINTYOU_DATA_API_WORLD_OASIS_GET = 'data-api.world.oasis.get';
export const MINTYOU_RUNTIME_PROFILE_READ_AGENT = 'runtime.profile.read.agent';

export const MINTYOU_CAPABILITIES = [
  'runtime.ai.text.generate',
  'runtime.route.list.options',
  `data.query.${MINTYOU_DATA_API_AGENTS_CREATE}`,
  `data.query.${MINTYOU_DATA_API_WORLD_ACCESS_ME}`,
  `data.query.${MINTYOU_DATA_API_WORLD_OASIS_GET}`,
  MINTYOU_RUNTIME_PROFILE_READ_AGENT,
  'data.store.mod-state',
  `ui.register.${MINTYOU_NAV_SLOT}`,
  `ui.register.${MINTYOU_ROUTE_SLOT}`,
] as const;

export const MINTYOU_PERMISSIONS = [...MINTYOU_CAPABILITIES] as const;

export const MINTYOU_REASON = {
  INPUT_INVALID: 'MINTYOU_INPUT_INVALID',
  INTERVIEW_INCOMPLETE: 'MINTYOU_INTERVIEW_INCOMPLETE',
  INTERVIEW_DEGRADED: 'MINTYOU_INTERVIEW_DEGRADED',
  INTERVIEW_TURN_FAILED: 'MINTYOU_INTERVIEW_TURN_FAILED',
  TRAIT_EXTRACTION_FAILED: 'MINTYOU_TRAIT_EXTRACTION_FAILED',
  DNA_SYNTHESIS_FAILED: 'MINTYOU_DNA_SYNTHESIS_FAILED',
  CONFIRM_REQUIRED: 'MINTYOU_CONFIRM_REQUIRED',
  WORLD_NOT_SELECTED: 'MINTYOU_WORLD_NOT_SELECTED',
  AGENT_CREATE_FAILED: 'MINTYOU_AGENT_CREATE_FAILED',
  HANDLE_UNAVAILABLE: 'MINTYOU_HANDLE_UNAVAILABLE',
  AGENT_LIMIT_REACHED: 'MINTYOU_AGENT_LIMIT_REACHED',
  SESSION_EXPIRED_WARN: 'MINTYOU_SESSION_EXPIRED_WARN',
  PHOTO_NO_PHOTO: 'MINTYOU_PHOTO_NO_PHOTO',
  PHOTO_REQUEST_DECLINED: 'MINTYOU_PHOTO_REQUEST_DECLINED',
  PHOTO_COOLDOWN_ACTIVE: 'MINTYOU_PHOTO_COOLDOWN_ACTIVE',
} as const;

export const MINTYOU_AUDIT = {
  SESSION_STARTED: 'mint-you.session.started',
  SESSION_RESUMED: 'mint-you.session.resumed',
  BASIC_INFO_SUBMITTED: 'mint-you.basic-info.submitted',
  INTERESTS_SELECTED: 'mint-you.interests.selected',
  INTERVIEW_STARTED: 'mint-you.interview.started',
  INTERVIEW_TURN_COMPLETED: 'mint-you.interview.turn-completed',
  INTERVIEW_COMPLETED: 'mint-you.interview.completed',
  TRAIT_EXTRACT_STARTED: 'mint-you.trait-extract.started',
  TRAIT_EXTRACT_DONE: 'mint-you.trait-extract.done',
  DNA_SYNTHESIS_STARTED: 'mint-you.dna-synthesis.started',
  DNA_SYNTHESIS_DONE: 'mint-you.dna-synthesis.done',
  DNA_SYNTHESIS_FAILED: 'mint-you.dna-synthesis.failed',
  TRAIT_OVERRIDE: 'mint-you.trait.override',
  RESYNTHESIS_TRIGGERED: 'mint-you.resynthesis.triggered',
  AGENT_CREATE_STARTED: 'mint-you.agent-create.started',
  AGENT_CREATE_DONE: 'mint-you.agent-create.done',
  AGENT_CREATE_FAILED: 'mint-you.agent-create.failed',
  PHOTO_UPLOADED: 'mint-you.photo.uploaded',
  PHOTO_REQUESTED: 'mint-you.photo.requested',
  PHOTO_ACCEPTED: 'mint-you.photo.accepted',
  PHOTO_DECLINED: 'mint-you.photo.declined',
  PHOTO_REVOKED: 'mint-you.photo.revoked',
} as const;

export const MINTYOU_PIPELINE_STEPS = [
  'basic-info',
  'interest-tags',
  'interview',
  'trait-extract',
  'dna-synthesize',
  'preview-card',
  'user-confirm',
  'agent-create',
] as const;

export type MintYouPipelineStep = (typeof MINTYOU_PIPELINE_STEPS)[number];

export const PRIMARY_ARCHETYPES = [
  'CARING',
  'PLAYFUL',
  'INTELLECTUAL',
  'CONFIDENT',
  'MYSTERIOUS',
  'ROMANTIC',
] as const;

export type DnaPrimaryType = (typeof PRIMARY_ARCHETYPES)[number];

export const SECONDARY_TRAITS = [
  'HUMOROUS',
  'SARCASTIC',
  'GENTLE',
  'DIRECT',
  'OPTIMISTIC',
  'REALISTIC',
  'DRAMATIC',
  'PASSIONATE',
  'REBELLIOUS',
  'INNOCENT',
  'WISE',
  'ECCENTRIC',
] as const;

export type DnaSecondaryTrait = (typeof SECONDARY_TRAITS)[number];

export const RELATIONSHIP_MODES = [
  'SECURE',
  'PASSIONATE',
  'INDEPENDENT',
] as const;

export type RelationshipMode = (typeof RELATIONSHIP_MODES)[number];

export const FORMALITY_VALUES = ['casual', 'formal', 'slang'] as const;
export type FormalityValue = (typeof FORMALITY_VALUES)[number];

export const SENTIMENT_VALUES = ['positive', 'neutral', 'cynical'] as const;
export type SentimentValue = (typeof SENTIMENT_VALUES)[number];
