import { z } from 'zod';
import {
  MBTI_VALUES,
  SOCIAL_PROFILE_LIMITS,
} from './contracts.js';

export const BasicInfoSchema = z.object({
  displayName: z.string().min(1).max(50),
  gender: z.enum(['MALE', 'FEMALE', 'NONBINARY', 'PREFER_NOT_SAY']),
  ageRange: z.enum(['18-24', '25-30', '31-40', '40+']),
  socialIntent: z.enum(['dating', 'friendship', 'social-explore', 'professional']),
});

export const InterestSelectionSchema = z.array(z.string().min(1))
  .min(SOCIAL_PROFILE_LIMITS.minInterests)
  .max(SOCIAL_PROFILE_LIMITS.maxInterests);

export const SocialProfileSchema = z.object({
  selectedInterests: InterestSelectionSchema,
  selfReportedMbti: z.enum(MBTI_VALUES).nullable(),
  currentFocus: z.string().trim().max(SOCIAL_PROFILE_LIMITS.currentFocusMaxLength),
});

export const InterviewTurnOutputSchema = z.object({
  assistantReply: z.string().min(1),
  traitSignals: z.array(z.object({
    key: z.string().min(1),
    weight: z.number().int(),
    evidence: z.string().max(200),
  })).max(8),
  turnControl: z.object({
    suggestedEnd: z.boolean(),
    phase: z.enum(['opening', 'exploring', 'deepening', 'wrapping']),
    nextQuestionFocus: z.string(),
  }),
  memoryDigest: z.string().max(2000),
});

export const DnaSynthesisOutputSchema = z.object({
  concept: z.string().min(1),
  description: z.string().min(1),
  greeting: z.string().min(1),
  exampleDialogue: z.string().min(1),
  systemPromptBase: z.string().min(1),
  rules: z.array(z.string().min(1)).min(1),
  scenario: z.string().min(1),
  identity: z.object({
    role: z.string().min(1),
    worldview: z.string().min(1),
    summary: z.string().min(1),
  }),
  personality: z.object({
    summary: z.string().min(1),
    mbti: z.enum(MBTI_VALUES),
  }),
  communication: z.object({
    summary: z.string().min(1),
    responseLength: z.enum(['short', 'medium', 'long']),
  }),
});
