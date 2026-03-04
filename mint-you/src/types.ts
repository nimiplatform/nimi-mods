import type {
  DnaPrimaryType,
  DnaSecondaryTrait,
  RelationshipMode,
  FormalityValue,
  SentimentValue,
  MintYouPipelineStep,
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
  | 'creative'
  | 'social'
  | 'wellness';

export type InterestTag = {
  id: string;
  label: string;
  category: InterestCategory;
};

// ── Scenarios ──

export type ScenarioChoice = {
  id: string;
  label: string;
  traitWeights: Record<string, number>;
};

export type Scenario = {
  id: string;
  narrative: string;
  choices: ScenarioChoice[];
};

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
    mbti: string;
  };
  communication: {
    summary: string;
    responseLength: 'short' | 'medium' | 'long';
  };
};

// ── Agent DNA Structure ──

export type AgentDna = {
  identity: {
    name: string;
    role: string;
    worldview: string;
    species: string;
    summary: string;
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
    summary: string;
    mbti: string;
    interests: string[];
    goals: string[];
    relationshipMode: RelationshipMode;
  };
  communication: {
    summary: string;
    responseLength: string;
    formality: FormalityValue;
    sentiment: SentimentValue;
  };
};

// ── Create Agent DTO ──

export type CreateAgentDto = {
  handle: string;
  concept: string;
  displayName: string;
  dnaPrimary: DnaPrimaryType;
  dnaSecondary: DnaSecondaryTrait[];
  worldId: string;
  ownershipType: 'WORLD_OWNED';
  wakeStrategy: 'PASSIVE';
  dna: AgentDna;
  description?: string;
  greeting?: string;
  exampleDialogue?: string;
  systemPromptBase?: string;
  rules?: AgentRules;
  scenario?: string;
  referenceImageUrl?: string;
  agentLorebooks?: never[];
  alternateGreetings?: never[];
  postHistoryInstructions?: null;
};

// ── Session ──

export type MintYouSession = {
  sessionId: string;
  userId: string;
  currentStep: MintYouPipelineStep;
  basicInfo: BasicInfo | null;
  selectedInterests: string[];
  scenarioChoices: Record<string, string>;
  traitResult: TraitExtractionResult | null;
  dnaSynthesis: DnaSynthesisOutput | null;
  traitOverrides: {
    dnaPrimary?: DnaPrimaryType;
    dnaSecondary?: DnaSecondaryTrait[];
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

// ── Error ──

export type MintYouError = {
  reasonCode: string;
  message: string;
  actionHint: string;
};

export type MintYouResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: MintYouError };
