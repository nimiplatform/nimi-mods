import type {
  AgentDnaDto,
  CreateAgentDto as RealmCreateAgentDto,
} from '@nimiplatform/sdk/realm';
import type {
  DnaPrimaryType,
  DnaSecondaryTrait,
  RelationshipMode,
  FormalityValue,
  SentimentValue,
  MintYouPipelineStep,
  MbtiValue,
} from './contracts.js';

// ── Basic Info ──

export type Gender = 'MALE' | 'FEMALE' | 'NONBINARY' | 'PREFER_NOT_SAY';
export type AgeRange = '18-24' | '25-30' | '31-40' | '40+';
export type SocialIntent = 'dating' | 'friendship' | 'social-explore' | 'professional';

export type BasicInfo = {
  displayName: string;
  gender: Gender;
  ageRange: AgeRange;
  socialIntent: SocialIntent;
};

// ── Interest Tags ──

export type InterestCategory =
  | 'lifestyle'
  | 'entertainment'
  | 'intellectual'
  | 'creative';

export type InterestTag = {
  id: string;
  label: string;
  category: InterestCategory;
};

export type SocialProfile = {
  selectedInterests: string[];
  selfReportedMbti: MbtiValue | null;
  currentFocus: string;
};

// ── Interview ──

export type InterviewMessage = {
  id: string;
  role: 'user' | 'ai';
  content: string;
  timestamp: number;
};

export type InterviewTurnSignal = {
  turnIndex: number;
  messageId: string;
  key: string;
  weight: number;
  evidence: string;
};

export type InterviewTurnOutput = {
  assistantReply: string;
  traitSignals: Array<{ key: string; weight: number; evidence: string }>;
  turnControl: {
    suggestedEnd: boolean;
    phase: 'opening' | 'exploring' | 'deepening' | 'wrapping';
    nextQuestionFocus: string;
  };
  memoryDigest: string;
};

export type InterviewStatus = 'idle' | 'ai-thinking' | 'typing' | 'complete' | 'error';
export type MintYouInterviewLanguage = 'en' | 'zh';

// ── Trait Extraction Result ──

export type TraitExtractionResult = {
  dnaPrimary: DnaPrimaryType;
  dnaSecondary: DnaSecondaryTrait[];
  relationshipMode: RelationshipMode;
  formality: FormalityValue;
  sentiment: SentimentValue;
  scores: {
    primary: Record<string, number>;
    secondary: Record<string, number>;
    relationship: Record<string, number>;
    formality: Record<string, number>;
    sentiment: Record<string, number>;
  };
};

// ── Rules Format ──

export type AgentRules = {
  format: 'rule-lines-v1';
  lines: string[];
  text: string;
};

// ── DNA Synthesis Output (from LLM) ──

export type DnaSynthesisOutput = {
  concept: string;
  description: string;
  greeting: string;
  exampleDialogue: string;
  systemPromptBase: string;
  rules: string[];
  scenario: string;
  identity: {
    role: string;
    worldview: string;
    summary: string;
  };
  personality: {
    summary: string;
    mbti: MbtiValue;
  };
  communication: {
    summary: string;
    responseLength: 'short' | 'medium' | 'long';
  };
};

// ── Agent DNA Structure ──

export type AgentDna = AgentDnaDto;

// ── Create Agent DTO ──

export type CreateAgentDto = RealmCreateAgentDto;

// ── Session ──

export type MintYouSession = {
  sessionVersion: number;
  sessionId: string;
  userId: string;
  currentStep: MintYouPipelineStep;
  basicInfo: BasicInfo | null;
  selectedInterests: string[];
  selfReportedMbti: MbtiValue | null;
  currentFocus: string;
  interviewMessages: InterviewMessage[];
  interviewSignals: InterviewTurnSignal[];
  interviewTurnCount: number;
  interviewValidTurnCount: number;
  interviewLanguage: MintYouInterviewLanguage | null;
  memoryDigest: string;
  traitResult: TraitExtractionResult | null;
  dnaSynthesis: DnaSynthesisOutput | null;
  traitOverrides: {
    dnaPrimary?: DnaPrimaryType;
    dnaSecondary?: DnaSecondaryTrait[];
    relationshipMode?: RelationshipMode;
    formality?: FormalityValue;
    sentiment?: SentimentValue;
  } | null;
  referenceImageUrl: string | null;
  worldId: string | null;
  confirmed: boolean;
  createdAgentId: string | null;
  createdAt: number;
  updatedAt: number;
};

// ── Photo Trust ──

export type PhotoAuthState = 'NONE' | 'A_REQUESTED' | 'MUTUAL' | 'DECLINED';

export type PhotoAuthRecord = {
  state: PhotoAuthState;
  requestedBy: string | null;
  declinedAt: number | null;
  worldId: string;
};

export type PhotoAuthSnapshot = {
  state: PhotoAuthState;
  requestedBy: string | null;
  cooldownRemainingMs: number;
  canRequest: boolean;
};

// ── Error ──

export type MintYouError = {
  reasonCode: string;
  message: string;
  actionHint: string;
};

export type MintYouResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: MintYouError };
