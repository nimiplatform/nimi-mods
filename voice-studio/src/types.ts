// ---------------------------------------------------------------------------
// Voice Studio domain types
// ---------------------------------------------------------------------------

/** Segment speech type */
export type SegmentType = 'dialogue' | 'narration' | 'inner_thought' | 'sound_effect';

/** Character gender */
export type Gender = 'male' | 'female' | 'neutral';

/** Character age group */
export type AgeGroup = 'child' | 'young' | 'adult' | 'elder';

/** Character tier derived from segment count */
export type CharacterTier = 'major' | 'supporting' | 'minor';

/** Project lifecycle state */
export type ProjectState =
  | 'draft'
  | 'imported'
  | 'analyzing'
  | 'analyzed'
  | 'casting'
  | 'cast_complete'
  | 'synthesizing'
  | 'done'
  | 'done_with_errors'
  | 'cancelled'
  | 'paused';

/** Voice source strategy */
export type VoiceSource = 'preset' | 'designed';

/** Synthesis job status */
export type SynthesisJobStatus =
  | 'idle'
  | 'running'
  | 'done'
  | 'done_with_errors'
  | 'cancelled'
  | 'paused';

/** Segment job status */
export type SegmentJobStatus = 'pending' | 'running' | 'done' | 'failed';

/** Error classification for retry logic */
export type ErrorClassification = 'transient' | 'permanent';

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

/** VS-ENT-002: Imported text chapter */
export type SourceChapter = {
  index: number;
  title: string;
  rawText: string;
};

/** VS-ENT-004: Minimal TTS synthesis unit */
export type ScriptSegment = {
  id: string;
  chapterIndex: number;
  index: number;
  type: SegmentType;
  speaker: string;
  text: string;
  startOffset: number;
  endOffset: number;
  emotion?: string;
};

/** VS-ENT-005: LLM-extracted character metadata */
export type CharacterProfile = {
  name: string;
  gender: Gender;
  ageGroup: AgeGroup;
  traits: string[];
  segmentCount: number;
  tier: CharacterTier;
};

/** VS-ENT-006: Character ↔ TTS voice mapping */
export type VoiceCasting = {
  characterName: string;
  voiceSource: VoiceSource;
  providerId: string;
  voiceId: string;
  voiceName: string;
  speakingRate: number;
  pitch: number;
  emotion?: string;
  previewAudioUri?: string;
};

/** VS-ENT-008: Single segment synthesis task */
export type SegmentJob = {
  segmentId: string;
  status: SegmentJobStatus;
  audioStorageKey: string;
  durationMs?: number;
  retryCount: number;
  error?: string;
  errorClassification?: ErrorClassification;
  startedAt?: string;
  completedAt?: string;
};

/** VS-ENT-007: Batch synthesis job */
export type SynthesisJob = {
  projectId: string;
  status: SynthesisJobStatus;
  segmentJobs: SegmentJob[];
  startedAt?: string;
  completedAt?: string;
};

/** VS-ENT-009: Chapter-level audio metadata */
export type AudioOutput = {
  projectId: string;
  chapterIndex: number;
  totalDurationMs: number;
  segmentIds: string[];
};

/** VS-ENT-003: LLM analysis output */
export type Script = {
  projectId: string;
  segments: ScriptSegment[];
  lastProcessedChapter: number;
};

/** VS-ENT-001: Top-level aggregate root */
export type VoiceProject = {
  id: string;
  name: string;
  state: ProjectState;
  sourceChapters: SourceChapter[];
  script?: Script;
  characters: CharacterProfile[];
  voiceCastings: VoiceCasting[];
  synthesisJob?: SynthesisJob;
  audioOutputs: AudioOutput[];
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Text stats
// ---------------------------------------------------------------------------

export type TextStats = {
  totalChars: number;
  totalChapters: number;
  chapterStats: Array<{
    index: number;
    title: string;
    charCount: number;
  }>;
};

// ---------------------------------------------------------------------------
// LLM analysis output shape (per-chapter)
// ---------------------------------------------------------------------------

export type AnalysisChapterOutput = {
  segments: Array<{
    type: SegmentType;
    speaker: string;
    text: string;
    emotion?: string;
  }>;
  characters: Array<{
    name: string;
    gender: Gender;
    ageGroup: AgeGroup;
    traits: string[];
    isNew: boolean;
  }>;
};

// ---------------------------------------------------------------------------
// Service abstractions (injected, not imported from SDK)
// ---------------------------------------------------------------------------

/** LLM text generation client abstraction */
export type LlmClient = {
  generateText(input: {
    routeHint?: string;
    systemPrompt: string;
    userPrompt: string;
    maxTokens?: number;
    temperature?: number;
  }): Promise<{ text: string }>;
};

/** TTS synthesis client abstraction */
export type TtsClient = {
  listVoices(): Promise<Array<{
    providerId: string;
    voiceId: string;
    voiceName: string;
    gender?: Gender;
    language?: string;
    previewUrl?: string;
  }>>;
  synthesize(input: {
    text: string;
    voiceId: string;
    providerId: string;
    speakingRate?: number;
    pitch?: number;
    emotion?: string;
  }): Promise<{ audioBlob: Blob; durationMs: number }>;
};

// ---------------------------------------------------------------------------
// Character tier thresholds (configurable per project)
// ---------------------------------------------------------------------------

export type CharacterTierThresholds = {
  majorMin: number;
  supportingMin: number;
};

export const DEFAULT_TIER_THRESHOLDS: CharacterTierThresholds = {
  majorMin: 20,
  supportingMin: 5,
};
