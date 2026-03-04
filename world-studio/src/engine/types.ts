import type { RuntimeRouteBinding } from '@nimiplatform/sdk/mod/runtime-route';
import type { RuntimeRouteOverride } from '@nimiplatform/sdk/mod/types';

export type DistillStage =
  | 'INGEST'
  | 'COARSE'
  | 'FINE'
  | 'MERGE'
  | 'CHECKPOINTS'
  | 'SYNTHESIZE'
  | 'DRAFT'
  | 'PUBLISH';

export type DistillRouteStage = 'coarse' | 'fine';

export type WorldStudioRouteOverride = RuntimeRouteBinding;

export type DistillRouteOverrideMap = {
  coarse: WorldStudioRouteOverride | null;
  fine: WorldStudioRouteOverride | null;
};

export type EvidenceRefDraft = {
  segmentId: string;
  offsetStart: number;
  offsetEnd: number;
  excerpt: string;
  confidence: number;
  sourceType: 'chunk' | 'text' | 'file';
};

export type EventNodeDraft = {
  id: string;
  level: 'PRIMARY' | 'SECONDARY';
  parentEventId: string | null;
  title: string;
  summary: string;
  cause: string;
  process: string;
  result: string;
  timeRef: string;
  locationRefs: string[];
  characterRefs: string[];
  dependsOnEventIds: string[];
  temporalBeforeEventIds?: string[];
  temporalAfterEventIds?: string[];
  temporalConfidence?: number;
  evidenceRefs: EvidenceRefDraft[];
  confidence: number;
  needsEvidence: boolean;
};

export type Phase1Option = {
  id: string;
  label: string;
  description: string;
  weight: number;
};

export type Phase1Character = {
  name: string;
  summary: string;
  significance: number;
};

export type WorldStudioNarrativeArc = {
  summary: string;
  opening: string;
  development: string;
  climax: string;
  resolution: string;
};

export type WorldStudioCharacterProfile = {
  name: string;
  aliases: string[];
  summary: string;
  background: string;
  motivation: string;
  relationships: string[];
  keyEvents: string[];
};

export type WorldStudioQualityIssue = {
  code: string;
  severity: 'BLOCK' | 'WARN';
  message: string;
  detail?: string;
};

export type WorldStudioQualityGateStatus = 'PASS' | 'WARN' | 'BLOCK';

export type TimelinePoint = Record<string, unknown>;
export type LocationPoint = Record<string, unknown>;
export type CharacterPoint = Record<string, unknown>;
export type CharacterRelationPoint = Record<string, unknown>;
export type FutureHistoricalEventPoint = Record<string, unknown>;

export type WorldStudioKnowledgeGraphDraft = {
  worldSetting: string;
  timeline: TimelinePoint[];
  locations: LocationPoint[];
  characters: CharacterPoint[];
  events: {
    primary: EventNodeDraft[];
    secondary: EventNodeDraft[];
  };
  characterRelations: CharacterRelationPoint[];
  futureHistoricalEvents: FutureHistoricalEventPoint[];
  narrativeArc?: WorldStudioNarrativeArc | null;
  characterProfiles?: WorldStudioCharacterProfile[];
  characterAliasMap?: Record<string, string>;
};

export type ChunkExtraction = Omit<WorldStudioKnowledgeGraphDraft, 'futureHistoricalEvents'>;

export type ChunkTaskResult = {
  chunkIndex: number;
  stage: DistillRouteStage;
  status: 'success' | 'failed';
  retryCount: number;
  errorCode?: string;
  errorMessage?: string;
};

export type ExtractionCoverageMetrics = {
  totalChunks: number;
  successChunks: number;
  failedChunks: number;
  chunkSuccessRatio: number;
  primaryCount: number;
  secondaryCount: number;
  worldSettingCount: number;
  timelineCount: number;
  locationsCount: number;
  charactersCount: number;
  characterRelationsCount: number;
  futureEventsCount: number;
  primaryEvidenceCoverage: number;
  eventCharacterCoverage: number;
  eventLocationCoverage: number;
  primaryNarrativeCompleteness: number;
  storyArcCompleteness: number;
  characterNamePurity: number;
  characterProfileCoverage: number;
};

export type QualityGateResult = {
  status: WorldStudioQualityGateStatus;
  issues: WorldStudioQualityIssue[];
  pass: boolean;
  reasons: string[];
  metrics: ExtractionCoverageMetrics;
};

export type WorldStudioProgressState = {
  phase: 'ingest' | 'extract' | 'merge' | 'synthesize' | 'validate';
  chunkTotal: number;
  chunkProcessed: number;
  chunkCompleted: number;
  chunkFailed: number;
  progress: number;
  etaSeconds: number | null;
};

export type WorldStudioTaskInterruptReason = 'pause' | 'cancel';

export type Phase1Result = {
  startTimeOptions: Phase1Option[];
  characterCandidates: Phase1Character[];
  knowledgeGraph: WorldStudioKnowledgeGraphDraft;
  finalDraftAccumulator: FinalDraftAccumulator;
  qualityGate: QualityGateResult;
  chunkTasks: ChunkTaskResult[];
  rawText: string;
  interrupted?: {
    reason: WorldStudioTaskInterruptReason;
  };
};

export type WorldStudioAgentDna = {
  identity: { name: string; role: string; worldview: string; species: string; summary?: string };
  biological: { gender: string; visualAge: string; ethnicity: string; heightCm: number; weightKg: number };
  appearance: { artStyle: string; hair: string; eyes: string; skin: string; fashionStyle: string; signatureItems: string[] };
  personality: { summary?: string; mbti: string; interests: string[]; goals: string[]; relationshipMode: string };
  communication: { summary?: string; responseLength: 'short' | 'medium' | 'long'; formality: 'casual' | 'formal' | 'slang'; sentiment: 'positive' | 'neutral' | 'cynical' };
  voice?: {
    voiceId: string;
    emotionEnabled?: boolean;
    speed?: number;
    pitch?: number;
  };
  nsfwLevel?: string;
};

export type WorldStudioAgentLorebookDraft = {
  name: string;
  content: string;
  keywords: string[];
  priority?: number;
  insertionOrder?: number;
  constant?: boolean;
  selective?: boolean;
  secondaryKeys?: string[];
  enabled?: boolean;
  source?: string | null;
};

export type WorldStudioAgentRules = {
  format: 'rule-lines-v1';
  lines: string[];
  text: string;
};

export type WorldStudioAgentDraft = {
  characterName: string;
  handle: string;
  concept: string;
  backstory: string;
  coreValues: string;
  relationshipStyle: string;
  description?: string | null;
  scenario?: string | null;
  greeting?: string | null;
  exampleDialogue?: string | null;
  systemPromptBase?: string | null;
  rules?: WorldStudioAgentRules;
  postHistoryInstructions?: string | null;
  alternateGreetings?: string[];
  agentLorebooks?: WorldStudioAgentLorebookDraft[];
  referenceImageUrl?: string | null;
  wakeStrategy?: 'PASSIVE' | 'PROACTIVE';
  dnaPrimary?: string;
  dnaSecondary?: string[];
  dna?: WorldStudioAgentDna;
};

export type DraftPatchEvidenceRef = {
  fieldPath: string;
  segmentId?: string;
  eventId?: string;
  confidence?: number;
};

export type DraftPatch = {
  chunkIndex: number;
  world?: Record<string, unknown>;
  worldview?: Record<string, unknown>;
  worldLorebooks?: Array<Record<string, unknown>>;
  futureHistoricalEvents?: Array<Record<string, unknown>>;
  agentDrafts?: WorldStudioAgentDraft[];
  evidenceRefs?: DraftPatchEvidenceRef[];
  notes?: string[];
};

export type FinalDraftAccumulatorRevision = {
  chunkIndex: number;
  appliedAt: string;
  changedFields: string[];
  note?: string;
};

export type FinalDraftAccumulator = {
  world: Record<string, unknown>;
  worldview: Record<string, unknown>;
  worldLorebooks: Array<Record<string, unknown>>;
  futureHistoricalEvents: Array<Record<string, unknown>>;
  agentDraftsByCharacter: Record<string, WorldStudioAgentDraft>;
  revisions: FinalDraftAccumulatorRevision[];
  lastUpdatedChunk: number;
};

export type Phase2Result = {
  world: Record<string, unknown>;
  worldview: Record<string, unknown>;
  worldLorebooks: Array<Record<string, unknown>>;
  worldEvents: EventNodeDraft[];
  futureHistoricalEvents: Array<Record<string, unknown>>;
  agentDrafts: WorldStudioAgentDraft[];
  finalDraftAccumulator?: FinalDraftAccumulator;
  rawText: string;
};

export type RouteCapabilityLlmInvoker = {
  generateText: (input: {
    routeHint?: string;
    prompt: string;
    maxTokens?: number;
    temperature?: number;
    mode?: 'STORY' | 'SCENE_TURN';
    worldId?: string;
    agentId?: string;
    abortSignal?: AbortSignal;
    routeOverride?: RuntimeRouteOverride;
  }) => Promise<{ text: string; promptTraceId: string }>;
};

/** Freshness metadata tracked by merge logic, NOT by LLM */
export type EntityFreshness = {
  firstSeenChunk: number;
  lastSeenChunk: number;
  mentionCount: number;
};

/** A character entity with freshness tracking */
export type AccumulatedCharacter = Record<string, unknown> & {
  _freshness: EntityFreshness;
};

/** A location entity with freshness tracking */
export type AccumulatedLocation = Record<string, unknown> & {
  _freshness: EntityFreshness;
};

/** An event entity with freshness tracking */
export type AccumulatedEvent = EventNodeDraft & {
  _freshness: EntityFreshness;
};

/** A relation entity with freshness tracking */
export type AccumulatedRelation = Record<string, unknown> & {
  _freshness: EntityFreshness;
};

/** A timeline entry with freshness tracking */
export type AccumulatedTimeline = Record<string, unknown> & {
  _freshness: EntityFreshness;
};

/** Full accumulated state — grows unbounded during extraction */
export type AccumulatedState = {
  worldSetting: string;
  timeline: AccumulatedTimeline[];
  locations: AccumulatedLocation[];
  characters: AccumulatedCharacter[];
  events: {
    primary: AccumulatedEvent[];
    secondary: AccumulatedEvent[];
  };
  characterRelations: AccumulatedRelation[];
  lastProcessedChunk: number;
  successfulChunks: number;
};
