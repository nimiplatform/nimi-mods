import { type RuntimeRouteBinding } from "@nimiplatform/sdk/mod";
export type DistillStage = 'INGEST' | 'COARSE' | 'FINE' | 'MERGE' | 'CHECKPOINTS' | 'SYNTHESIZE' | 'DRAFT' | 'PUBLISH';
export type DistillRouteStage = 'coarse' | 'fine';
export type RouteBinding = RuntimeRouteBinding;
export type DistillRouteBindingMap = {
    coarse: RouteBinding | null;
    fine: RouteBinding | null;
};
export type ChunkTaskResult = {
    chunkIndex: number;
    stage: DistillRouteStage;
    status: 'success' | 'failed';
    retryCount: number;
    errorCode?: string;
    errorMessage?: string;
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
    timelineSeq?: number;
    level: 'PRIMARY' | 'SECONDARY';
    eventHorizon: 'PAST' | 'ONGOING' | 'FUTURE';
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
    editableCause?: string;
    editableProcess?: string;
    editableResult?: string;
    validation?: {
        titleComplete: boolean;
        timeRefComplete: boolean;
        evidenceComplete: boolean;
    };
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
    // backward-compatible field consumed by existing UI/tests.
    pass: boolean;
    // backward-compatible textual list derived from issues.
    reasons: string[];
    metrics: ExtractionCoverageMetrics;
};
export type TemporalNormalizationSummary = {
    reorderedEvents: number;
    rewrittenTimelineSeq: number;
    rebuiltTimelineCount: number;
    droppedConflictingEdges: number;
    dedupedPrimaryAnchors: number;
    startTimeCandidateCount: number;
};
export type WorldStudioChunkPolicyDiagnostics = {
    chunkSize: number;
    overlap: number;
    effectiveContextTokens: number;
    coarseModel: string;
    fineModel: string;
    contextSource: 'provider-api' | 'template' | 'default' | 'unknown';
};
export type WorldStudioParseJobState = {
    phase: 'idle' | 'ingest' | 'extract' | 'merge' | 'synthesize' | 'validate' | 'done' | 'failed';
    chunkTotal: number;
    chunkProcessed: number;
    chunkCompleted: number;
    chunkFailed: number;
    progress: number;
    etaSeconds: number | null;
    startedAt: string | null;
    updatedAt: string | null;
    chunkPolicy?: WorldStudioChunkPolicyDiagnostics;
};
export type WorldStudioTaskControlCapabilities = {
    canPause: boolean;
    canResume: boolean;
    canCancel: boolean;
};
export type WorldStudioKnowledgeGraphDraft = {
    worldSetting: string;
    timeline: Array<Record<string, unknown>>;
    locations: Array<Record<string, unknown>>;
    characters: Array<Record<string, unknown>>;
    events: {
        primary: EventNodeDraft[];
        secondary: EventNodeDraft[];
    };
    characterRelations: Array<Record<string, unknown>>;
    futureHistoricalEvents: Array<Record<string, unknown>>;
    narrativeArc?: WorldStudioNarrativeArc | null;
    characterProfiles?: WorldStudioCharacterProfile[];
    characterAliasMap?: Record<string, string>;
};
export type WorldStudioAssetDraft = {
    worldCover: {
        status: 'idle' | 'queued' | 'running' | 'succeeded' | 'failed';
        imageUrl: string | null;
    };
    characterPortraits: Record<string, {
        status: 'idle' | 'queued' | 'running' | 'succeeded' | 'failed';
        imageUrl: string | null;
    }>;
    locationImages: Record<string, {
        status: 'idle' | 'queued' | 'running' | 'succeeded' | 'failed';
        imageUrl: string | null;
    }>;
};
export type WorldStudioAgentDna = {
    identity: {
        name: string;
        role: string;
        worldview: string;
        species: string;
        summary?: string;
    };
    biological: {
        gender: string;
        visualAge: string;
        ethnicity: string;
        heightCm: number;
        weightKg: number;
    };
    appearance: {
        artStyle: string;
        hair: string;
        eyes: string;
        skin: string;
        fashionStyle: string;
        signatureItems: string[];
    };
    personality: {
        summary?: string;
        mbti: string;
        interests: string[];
        goals: string[];
        relationshipMode: string;
    };
    communication: {
        summary?: string;
        responseLength: 'short' | 'medium' | 'long';
        formality: 'casual' | 'formal' | 'slang';
        sentiment: 'positive' | 'neutral' | 'cynical';
    };
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
export type WorldProseCandidateField = 'description' | 'tagline' | 'motto' | 'overview';
export type AgentProseCandidateField = 'scenario' | 'greeting' | 'exampleDialogue' | 'systemPromptBase';
export type ProseCandidateOperation = 'create' | 'revise' | 'replace' | 'no-op';
export type ProsePatchDraft = {
    content: string;
    confidence: number;
    evidenceRefs?: DraftPatchEvidenceRef[];
};
export type WorkingProseRecord = {
    content: string;
    confidence: number;
    evidenceRefs: DraftPatchEvidenceRef[];
    chunkIndex: number;
    updatedAt: string;
};
export type ProseCandidateDraft = ProsePatchDraft;
export type ProseCandidateRecord = WorkingProseRecord;
export type DraftPatch = {
    chunkIndex: number;
    world?: Record<string, unknown>;
    worldview?: Record<string, unknown>;
    worldLorebooks?: Array<Record<string, unknown>>;
    futureHistoricalEvents?: Array<Record<string, unknown>>;
    agentDrafts?: WorldStudioAgentDraft[];
    worldProse?: Partial<Record<WorldProseCandidateField, ProsePatchDraft>>;
    agentProse?: Record<string, Partial<Record<AgentProseCandidateField, ProsePatchDraft>>>;
    evidenceRefs?: DraftPatchEvidenceRef[];
    notes?: string[];
};
export type FinalDraftAccumulatorRevision = {
    chunkIndex: number;
    appliedAt: string;
    changedFields: string[];
    candidateOps?: string[];
    note?: string;
};
export type FinalDraftAccumulator = {
    world: Record<string, unknown>;
    worldview: Record<string, unknown>;
    worldLorebooks: Array<Record<string, unknown>>;
    futureHistoricalEvents: Array<Record<string, unknown>>;
    agentDraftsByCharacter: Record<string, WorldStudioAgentDraft>;
    worldWorkingProseByField: Partial<Record<WorldProseCandidateField, WorkingProseRecord>>;
    agentWorkingProseByCharacterAndField: Record<string, Partial<Record<AgentProseCandidateField, WorkingProseRecord>>>;
    worldProseCandidatesByField: Partial<Record<WorldProseCandidateField, ProseCandidateRecord[]>>;
    agentProseCandidatesByCharacterAndField: Record<string, Partial<Record<AgentProseCandidateField, ProseCandidateRecord[]>>>;
    evidenceRefs: DraftPatchEvidenceRef[];
    revisions: FinalDraftAccumulatorRevision[];
    lastUpdatedChunk: number;
};
export type Phase2WeakFieldReason = 'empty' | 'low_information' | 'low_evidence' | 'incomplete_reference';
export type Phase2WeakFieldIssue = {
    path: string;
    reason: Phase2WeakFieldReason;
    detail: string;
};
export type Phase2EnrichmentPatch = {
    world?: Record<string, unknown>;
    worldview?: Record<string, unknown>;
    worldLorebooks?: Array<Record<string, unknown>>;
    futureHistoricalEvents?: Array<Record<string, unknown>>;
    agentDrafts?: Array<Partial<WorldStudioAgentDraft> & {
        characterName: string;
    }>;
};
export type WorldStudioAgentSyncPlan = {
    selectedCharacterIds: string[];
    ownershipType: 'WORLD_OWNED';
    targetWorldId: string;
    draftsByCharacter: Record<string, WorldStudioAgentDraft>;
};
export type WorldLorebookDraftRow = {
    id?: string;
    key: string;
    name?: string;
    content?: string;
    value?: Record<string, unknown>;
    keywords?: string[];
    priority?: number;
    constant?: boolean;
    enabled?: boolean;
    validFrom?: string;
    validTo?: string;
    provenance?: Record<string, unknown>;
};
