import { z } from 'zod';

export const BasicInfoSchema = z.object({
  displayName: z.string().min(1).max(50),
  gender: z.enum(['MALE', 'FEMALE', 'NONBINARY', 'PREFER_NOT_SAY']),
  ageRange: z.enum(['18-24', '25-30', '31-40', '40+']),
  socialIntent: z.enum(['dating', 'friendship', 'social-explore', 'professional']),
});

export const InterestSelectionSchema = z.array(z.string().min(1)).min(3).max(8);

export const ScenarioChoicesSchema = z.record(
  z.string().regex(/^MY-S\d{2}$/),
  z.string().regex(/^MY-S\d{2}-[A-D]$/),
).refine(
  (choices) => Object.keys(choices).length >= 7,
  { message: 'At least 7 scenario choices are required' },
).refine(
  (choices) => Object.keys(choices).length <= 10,
  { message: 'At most 10 scenario choices allowed' },
);

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
    mbti: z.string().regex(/^[EI][NS][TF][JP]$/),
  }),
  communication: z.object({
    summary: z.string().min(1),
    responseLength: z.enum(['short', 'medium', 'long']),
  }),
});
