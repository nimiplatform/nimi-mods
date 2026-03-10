import assert from 'node:assert/strict';
import test from 'node:test';

import { SocialProfileSchema } from '../src/schemas.js';
import { assembleCreateAgentDto } from '../src/pipeline/dto-assemble.js';
import type {
  BasicInfo,
  DnaSynthesisOutput,
  TraitExtractionResult,
} from '../src/types.js';

const basicInfo: BasicInfo = {
  displayName: 'Luna',
  gender: 'FEMALE',
  ageRange: '25-30',
  socialIntent: 'friendship',
};

const traitResult: TraitExtractionResult = {
  dnaPrimary: 'INTELLECTUAL',
  dnaSecondary: ['WISE', 'GENTLE'],
  relationshipMode: 'SECURE',
  formality: 'casual',
  sentiment: 'positive',
  scores: {
    primary: {},
    secondary: {},
    relationship: {},
    formality: {},
    sentiment: {},
  },
};

const dnaSynthesis: DnaSynthesisOutput = {
  concept: 'A warm and sharp-minded conversationalist.',
  description: 'She moves between calm insight and playful curiosity.',
  greeting: 'Hey, I am always down for a conversation that actually goes somewhere.',
  exampleDialogue: 'A: What are you into lately?\nB: The kind of ideas that change how you look at the week.',
  systemPromptBase: 'Stay thoughtful, observant, and socially warm.',
  rules: ['Stay warm.', 'Stay curious.'],
  scenario: 'Meeting someone new in OASIS.',
  identity: {
    role: 'Thoughtful companion',
    worldview: 'People become interesting when they feel safe enough to be specific.',
    summary: 'Thoughtful and grounded with a soft playful edge.',
  },
  personality: {
    summary: 'Intellectual, warm, and composed.',
    mbti: 'ENFP',
  },
  communication: {
    summary: 'Easy, observant, and low-pressure.',
    responseLength: 'medium',
  },
};

test('assembleCreateAgentDto prefers user-provided MBTI over synthesized MBTI', () => {
  const dto = assembleCreateAgentDto({
    handle: '~luna_ab12',
    basicInfo,
    traitResult,
    dnaSynthesis,
    interests: ['reading', 'philosophy', 'travel'],
    worldId: 'world-oasis',
    selfReportedMbti: 'INTJ',
  });

  assert.equal(dto.dna.personality.mbti, 'INTJ');
});

test('assembleCreateAgentDto falls back to synthesized MBTI when user leaves it blank', () => {
  const dto = assembleCreateAgentDto({
    handle: '~luna_ab12',
    basicInfo,
    traitResult,
    dnaSynthesis,
    interests: ['reading', 'philosophy', 'travel'],
    worldId: 'world-oasis',
    selfReportedMbti: null,
  });

  assert.equal(dto.dna.personality.mbti, 'ENFP');
});

test('social profile schema accepts the lightweight social profile inputs', () => {
  const result = SocialProfileSchema.safeParse({
    selectedInterests: ['reading', 'technology', 'travel'],
    selfReportedMbti: 'INFP',
    currentFocus: 'Trying to decide whether to move cities.',
  });

  assert.equal(result.success, true);
});
