import type {
  DnaPrimaryType,
  DnaSecondaryTrait,
  RelationshipMode,
  FormalityValue,
  SentimentValue,
  MbtiValue,
} from '../contracts.js';
import type { AgentRules } from '../types.js';
import {
  HARDCODED_IDENTITY,
  HARDCODED_BIOLOGICAL,
  HARDCODED_APPEARANCE,
  HARDCODED_AGENT,
  ageRangeToVisualAge,
} from '../data/hard-coded-defaults.js';
import type {
  BasicInfo,
  TraitExtractionResult,
  DnaSynthesisOutput,
  CreateAgentDto,
  AgentDna,
} from '../types.js';

function buildRules(lines: string[]): AgentRules {
  return {
    format: 'rule-lines-v1',
    lines,
    text: lines.join('\n'),
  };
}

export function assembleCreateAgentDto(input: {
  handle: string;
  basicInfo: BasicInfo;
  traitResult: TraitExtractionResult;
  dnaSynthesis: DnaSynthesisOutput;
  interests: string[];
  worldId: string;
  referenceImageUrl?: string | null;
  selfReportedMbti?: MbtiValue | null;
  traitOverrides?: {
    dnaPrimary?: DnaPrimaryType;
    dnaSecondary?: DnaSecondaryTrait[];
    relationshipMode?: RelationshipMode;
    formality?: FormalityValue;
    sentiment?: SentimentValue;
  } | null;
}): CreateAgentDto {
  const {
    handle,
    basicInfo,
    traitResult,
    dnaSynthesis,
    interests,
    worldId,
    referenceImageUrl,
    selfReportedMbti,
    traitOverrides,
  } = input;

  const effectivePrimary = traitOverrides?.dnaPrimary ?? traitResult.dnaPrimary;
  const effectiveSecondary = traitOverrides?.dnaSecondary ?? traitResult.dnaSecondary;
  const effectiveRelationshipMode = traitOverrides?.relationshipMode ?? traitResult.relationshipMode;
  const effectiveFormality = traitOverrides?.formality ?? traitResult.formality;
  const effectiveSentiment = traitOverrides?.sentiment ?? traitResult.sentiment;

  const dna: AgentDna = {
    identity: {
      name: basicInfo.displayName,
      role: dnaSynthesis.identity.role,
      worldview: dnaSynthesis.identity.worldview,
      species: HARDCODED_IDENTITY.species,
      summary: dnaSynthesis.identity.summary,
    },
    biological: {
      gender: basicInfo.gender,
      visualAge: ageRangeToVisualAge(basicInfo.ageRange),
      ethnicity: HARDCODED_BIOLOGICAL.ethnicity,
      heightCm: HARDCODED_BIOLOGICAL.heightCm,
      weightKg: HARDCODED_BIOLOGICAL.weightKg,
    },
    appearance: {
      artStyle: HARDCODED_APPEARANCE.artStyle,
      hair: HARDCODED_APPEARANCE.hair,
      eyes: HARDCODED_APPEARANCE.eyes,
      skin: HARDCODED_APPEARANCE.skin,
      fashionStyle: HARDCODED_APPEARANCE.fashionStyle,
      signatureItems: [...HARDCODED_APPEARANCE.signatureItems],
    },
    personality: {
      summary: dnaSynthesis.personality.summary,
      mbti: selfReportedMbti ?? dnaSynthesis.personality.mbti,
      interests,
      goals: [basicInfo.socialIntent],
      relationshipMode: effectiveRelationshipMode,
    },
    communication: {
      summary: dnaSynthesis.communication.summary,
      responseLength: dnaSynthesis.communication.responseLength,
      formality: effectiveFormality,
      sentiment: effectiveSentiment,
    },
  };

  const dto: CreateAgentDto = {
    handle,
    concept: dnaSynthesis.concept,
    displayName: basicInfo.displayName,
    dnaPrimary: effectivePrimary,
    dnaSecondary: effectiveSecondary,
    worldId,
    ownershipType: HARDCODED_AGENT.ownershipType,
    wakeStrategy: HARDCODED_AGENT.wakeStrategy,
    dna,
    description: dnaSynthesis.description,
    greeting: dnaSynthesis.greeting,
    exampleDialogue: dnaSynthesis.exampleDialogue,
    systemPromptBase: dnaSynthesis.systemPromptBase,
    rules: buildRules(dnaSynthesis.rules),
    scenario: dnaSynthesis.scenario,
    agentLorebooks: [...HARDCODED_AGENT.agentLorebooks],
    alternateGreetings: [...HARDCODED_AGENT.alternateGreetings],
  };

  if (HARDCODED_AGENT.postHistoryInstructions) {
    dto.postHistoryInstructions = HARDCODED_AGENT.postHistoryInstructions;
  }

  // Only include referenceImageUrl if it's a persistent URL (not blob: or data:).
  // Local previews use data: URLs which are not valid for server-side storage.
  // TODO: Replace with platform file upload when API becomes available.
  if (referenceImageUrl && !referenceImageUrl.startsWith('blob:') && !referenceImageUrl.startsWith('data:')) {
    dto.referenceImageUrl = referenceImageUrl;
  }

  return dto;
}
