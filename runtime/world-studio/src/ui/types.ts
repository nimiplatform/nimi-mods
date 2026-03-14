import type { WorldStudioLandingMode } from '../contracts.js';
import type { Phase1Result, Phase2Result } from '../generation/pipeline.js';

export type LandingState = {
  target: WorldStudioLandingMode;
  worldId: string | null;
  reason: string | null;
};

export type WorldDraftSummary = {
  id: string;
  targetWorldId: string | null;
  status: 'DRAFT' | 'SYNTHESIZE' | 'REVIEW' | 'PUBLISH' | 'FAILED';
  sourceType: 'TEXT' | 'FILE';
  sourceRef: string | null;
  updatedAt: string;
  publishedAt: string | null;
};

export type WorldSummary = {
  id: string;
  name: string;
  status: 'DRAFT' | 'PENDING_REVIEW' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  tagline: string | null;
  motto: string | null;
  overview: string | null;
  description: string | null;
  contentRating: string | null;
  updatedAt: string;
};

export type WorldMutationSummary = {
  id: string;
  worldId: string;
  mutationType:
    | 'SETTING_CHANGE'
    | 'RULE_UPDATE'
    | 'LOREBOOK_OVERRIDE'
    | 'TABOO_CHANGE'
    | 'LOCATION_CHANGE'
    | 'EVENT_CREATE'
    | 'EVENT_UPDATE'
    | 'EVENT_DELETE'
    | 'EVENT_BATCH_UPSERT';
  targetPath: string;
  reason: string | null;
  creatorId: string;
  createdAt: string;
};

export type WorldEventSummary = {
  id: string;
  worldId: string;
  timelineSeq: number;
  level: 'PRIMARY' | 'SECONDARY';
  eventHorizon: 'PAST' | 'ONGOING' | 'FUTURE';
  parentEventId: string | null;
  title: string;
  summary: string | null;
  cause: string | null;
  process: string | null;
  result: string | null;
  timeRef: string | null;
  locationRefs: string[];
  characterRefs: string[];
  dependsOnEventIds: string[];
  evidenceRefs: Array<Record<string, unknown>>;
  confidence: number;
  needsEvidence: boolean;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type WorldStudioAgentStatsSummary = {
  influenceTier: string | null;
  interactionTier: string | null;
  vitalityScore: number | null;
  lastActiveAt: string | null;
  engagementCount: number | null;
};

export type WorldStudioCreatorAgentSummary = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  tags: string[];
  category: string | null;
  contentRating: string | null;
  webhookUrl: string | null;
  capabilities: Record<string, unknown>;
  ownershipType: string | null;
  importance: string | null;
  state: string | null;
  worldId: string | null;
  activeWorldId: string | null;
  ownerWorldId: string | null;
  dna: Record<string, unknown> | null;
  liveState: Record<string, unknown> | null;
  stats: WorldStudioAgentStatsSummary | null;
};

export type WorldStudioMediaBindingSummary = {
  id: string;
  targetType: string;
  targetId: string;
  slot: string;
  priority: number;
  conditions: Record<string, unknown> | null;
  tags: string[];
  asset: {
    id: string | null;
    mediaType: string | null;
    storageRef: string | null;
    label: string | null;
    provenance: string | null;
    sourceRef: string | null;
    tags: string[];
  };
};

export type CreateResultState = {
  phase1: Phase1Result | null;
  phase2: Phase2Result | null;
};
