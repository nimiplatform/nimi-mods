import assert from 'node:assert/strict';
import test from 'node:test';

import type { ModRuntimeClient } from '@nimiplatform/sdk/mod';

import { synthesizeDna } from '../src/pipeline/dna-synthesize.js';
import type { BasicInfo, DnaSynthesisOutput, TraitExtractionResult } from '../src/types.js';

const BASIC_INFO: BasicInfo = {
  displayName: 'zk',
  gender: 'MALE',
  ageRange: '25-30',
  socialIntent: 'friendship',
};

const TRAIT_RESULT: TraitExtractionResult = {
  dnaPrimary: 'INTELLECTUAL',
  dnaSecondary: ['GENTLE', 'REALISTIC'],
  relationshipMode: 'INDEPENDENT',
  formality: 'casual',
  sentiment: 'positive',
  scores: {
    primary: { INTELLECTUAL: 4 },
    secondary: { GENTLE: 2, REALISTIC: 2 },
    relationship: { INDEPENDENT: 3 },
    formality: { casual: 2 },
    sentiment: { positive: 2 },
  },
};

const SYNTHESIS_OUTPUT: DnaSynthesisOutput = {
  concept: 'warm thinker',
  description: 'friendly and thoughtful',
  greeting: 'hello there',
  exampleDialogue: 'A: hi\nB: hello',
  systemPromptBase: 'stay warm and thoughtful',
  rules: ['be kind'],
  scenario: 'casual conversation',
  identity: {
    role: 'thoughtful companion',
    worldview: 'people matter',
    summary: 'steady and reflective',
  },
  personality: {
    summary: 'gentle and curious',
    mbti: 'INFP',
  },
  communication: {
    summary: 'soft and direct',
    responseLength: 'medium',
  },
};

function createRuntimeClient(calls: Array<{ input: string; system: string }>): ModRuntimeClient {
  return {
    ai: {
      text: {
        generate: async (input: { input: string; system: string }) => {
          calls.push({ input: String(input.input), system: String(input.system) });
          return { text: JSON.stringify(SYNTHESIS_OUTPUT) };
        },
      },
    },
  } as unknown as ModRuntimeClient;
}

test('mint-you dna synthesis locks natural-language output to Chinese when interview language is zh', async () => {
  const calls: Array<{ input: string; system: string }> = [];

  const result = await synthesizeDna({
    runtimeClient: createRuntimeClient(calls),
    basicInfo: BASIC_INFO,
    traitResult: TRAIT_RESULT,
    interests: ['travel', 'movies'],
    currentFocus: '最近有点忙',
    language: 'zh',
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.system, /All natural-language fields in the JSON must be written in Chinese \(中文\)\./);
  assert.match(calls[0]!.input, /Target Output Language: Chinese \(中文\)/);
});

test('mint-you dna synthesis locks natural-language output to English when interview language is en', async () => {
  const calls: Array<{ input: string; system: string }> = [];

  const result = await synthesizeDna({
    runtimeClient: createRuntimeClient(calls),
    basicInfo: BASIC_INFO,
    traitResult: TRAIT_RESULT,
    interests: ['travel', 'movies'],
    currentFocus: 'planning a trip',
    language: 'en',
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.system, /All natural-language fields in the JSON must be written in English\./);
  assert.match(calls[0]!.input, /Target Output Language: English/);
});
