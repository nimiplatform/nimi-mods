import { z } from 'zod';
import { VIDEOPLAY_PROMPT_ID } from '../contracts.js';

export type VideoPlayPromptScope =
  | 'storyboard-plan'
  | 'shot-rewrite'
  | 'shot-variant';

export type VideoPlayPromptLocale = 'zh' | 'en';

export const PROMPT_LOCALE_BASELINE = {
  locales: ['zh', 'en'] as const,
  fallbackLocale: 'zh' as const,
};

export type VideoPlayPromptTemplate = {
  promptId: string;
  scope: VideoPlayPromptScope;
  locale: VideoPlayPromptLocale;
  template: string;
};

export const StoryboardPlanVariableSchema = z.object({
  storyId: z.string().min(1),
  episodeId: z.string().min(1),
  worldStyle: z.string().min(1),
  beatsJson: z.string().min(2),
});

export const ShotRewriteVariableSchema = z.object({
  episodeId: z.string().min(1),
  shotId: z.string().min(1),
  sourceEventIds: z.string().min(1),
  styleHint: z.string().min(1),
});

export const ShotVariantVariableSchema = z.object({
  episodeId: z.string().min(1),
  baseShotId: z.string().min(1),
  sourceEventIds: z.string().min(1),
  variantInstruction: z.string().min(1),
});

export const PROMPT_VARIABLE_SCHEMA = {
  'storyboard-plan': StoryboardPlanVariableSchema,
  'shot-rewrite': ShotRewriteVariableSchema,
  'shot-variant': ShotVariantVariableSchema,
} as const;

const TEMPLATES: VideoPlayPromptTemplate[] = [
  {
    promptId: VIDEOPLAY_PROMPT_ID.STORYBOARD_PLAN,
    scope: 'storyboard-plan',
    locale: 'zh',
    template: [
      '你是分镜规划器。',
      'storyId={{storyId}}',
      'episodeId={{episodeId}}',
      'worldStyle={{worldStyle}}',
      'beats={{beatsJson}}',
      '输出 JSON，字段必须包含: episodeId, clipPlans, shotPlans, sourceEventIds。',
    ].join('\n'),
  },
  {
    promptId: VIDEOPLAY_PROMPT_ID.STORYBOARD_PLAN,
    scope: 'storyboard-plan',
    locale: 'en',
    template: [
      'You are a storyboard planner.',
      'storyId={{storyId}}',
      'episodeId={{episodeId}}',
      'worldStyle={{worldStyle}}',
      'beats={{beatsJson}}',
      'Return JSON with required fields: episodeId, clipPlans, shotPlans, sourceEventIds.',
    ].join('\n'),
  },
  {
    promptId: VIDEOPLAY_PROMPT_ID.SHOT_REWRITE,
    scope: 'shot-rewrite',
    locale: 'zh',
    template: [
      '你是镜头重写器。',
      'episodeId={{episodeId}}',
      'shotId={{shotId}}',
      'sourceEventIds={{sourceEventIds}}',
      'styleHint={{styleHint}}',
      '输出 JSON，字段必须包含: shotId, visualPrompt, motionCue, continuityAnchors。',
    ].join('\n'),
  },
  {
    promptId: VIDEOPLAY_PROMPT_ID.SHOT_REWRITE,
    scope: 'shot-rewrite',
    locale: 'en',
    template: [
      'You are a shot rewrite assistant.',
      'episodeId={{episodeId}}',
      'shotId={{shotId}}',
      'sourceEventIds={{sourceEventIds}}',
      'styleHint={{styleHint}}',
      'Return JSON with fields: shotId, visualPrompt, motionCue, continuityAnchors.',
    ].join('\n'),
  },
  {
    promptId: VIDEOPLAY_PROMPT_ID.SHOT_VARIANT,
    scope: 'shot-variant',
    locale: 'zh',
    template: [
      '你是镜头变体生成器。',
      'episodeId={{episodeId}}',
      'baseShotId={{baseShotId}}',
      'sourceEventIds={{sourceEventIds}}',
      'variantInstruction={{variantInstruction}}',
      '输出 JSON，字段必须包含: baseShotId, variantShotId, variantDelta, sourceEventIds。',
    ].join('\n'),
  },
  {
    promptId: VIDEOPLAY_PROMPT_ID.SHOT_VARIANT,
    scope: 'shot-variant',
    locale: 'en',
    template: [
      'You are a shot variant generator.',
      'episodeId={{episodeId}}',
      'baseShotId={{baseShotId}}',
      'sourceEventIds={{sourceEventIds}}',
      'variantInstruction={{variantInstruction}}',
      'Return JSON with fields: baseShotId, variantShotId, variantDelta, sourceEventIds.',
    ].join('\n'),
  },
];

export function listPromptTemplates(): VideoPlayPromptTemplate[] {
  return [...TEMPLATES];
}

export function findPromptTemplate(scope: VideoPlayPromptScope, locale: VideoPlayPromptLocale): VideoPlayPromptTemplate {
  const matched = TEMPLATES.find((row) => row.scope === scope && row.locale === locale);
  if (matched) {
    return matched;
  }
  const fallback = TEMPLATES.find((row) => row.scope === scope && row.locale === PROMPT_LOCALE_BASELINE.fallbackLocale);
  if (fallback) {
    return fallback;
  }
  throw new Error(`VIDEOPLAY_PROMPT_TEMPLATE_NOT_FOUND:${scope}:${locale}`);
}

function hasUnresolvedPlaceholders(template: string): boolean {
  return /\{\{[a-zA-Z0-9_]+\}\}/.test(template);
}

export function resolvePromptLocale(locale: string | null | undefined): VideoPlayPromptLocale {
  const normalized = String(locale || '').trim().toLowerCase();
  if (normalized === 'zh' || normalized === 'en') {
    return normalized;
  }
  return PROMPT_LOCALE_BASELINE.fallbackLocale;
}

export function listPromptScopes(): VideoPlayPromptScope[] {
  return ['storyboard-plan', 'shot-rewrite', 'shot-variant'];
}

export function getPromptFallbackLocale(): VideoPlayPromptLocale {
  return PROMPT_LOCALE_BASELINE.fallbackLocale;
}

export function listPromptLocales(): VideoPlayPromptLocale[] {
  return [...PROMPT_LOCALE_BASELINE.locales];
}

export function assertPromptLocaleParity(scope: VideoPlayPromptScope): { ok: boolean; reason?: string } {
  const zh = TEMPLATES.find((row) => row.scope === scope && row.locale === 'zh');
  const en = TEMPLATES.find((row) => row.scope === scope && row.locale === 'en');
  if (!zh || !en) {
    return { ok: false, reason: `scope:${scope}:missing_locale_template` };
  }
  const zhPlaceholders = extractPlaceholders(zh.template);
  const enPlaceholders = extractPlaceholders(en.template);
  if (JSON.stringify(zhPlaceholders) !== JSON.stringify(enPlaceholders)) {
    return { ok: false, reason: `scope:${scope}:placeholder_parity_mismatch` };
  }
  return { ok: true };
}

export function ensurePromptTemplateRegistered(scope: VideoPlayPromptScope): { ok: boolean; reason?: string } {
  const rows = TEMPLATES.filter((row) => row.scope === scope);
  if (rows.length === 0) {
    return { ok: false, reason: `scope:${scope}:template_missing` };
  }
  const promptIdSet = new Set(rows.map((row) => row.promptId));
  if (promptIdSet.size > 1) {
    return { ok: false, reason: `scope:${scope}:prompt_id_drift` };
  }
  return { ok: true };
}

export function renderPromptTemplate(
  scope: VideoPlayPromptScope,
  locale: VideoPlayPromptLocale,
  variables: Record<string, string>,
): string {
  const template = findPromptTemplate(scope, locale).template;
  let rendered = template;
  for (const [key, value] of Object.entries(variables)) {
    rendered = rendered.replaceAll(`{{${key}}}`, String(value));
  }
  if (hasUnresolvedPlaceholders(rendered)) {
    throw new Error(`VIDEOPLAY_PROMPT_TEMPLATE_VARIABLE_UNRESOLVED:${scope}:${locale}`);
  }
  return rendered;
}

export function validatePromptVariables(scope: VideoPlayPromptScope, variables: unknown): {
  ok: true;
  data: Record<string, string>;
} | {
  ok: false;
  issues: string[];
} {
  const schema = PROMPT_VARIABLE_SCHEMA[scope];
  const result = schema.safeParse(variables);
  if (!result.success) {
    return {
      ok: false,
      issues: result.error.issues.map((issue) => `${issue.path.join('.')}:${issue.message}`),
    };
  }
  return {
    ok: true,
    data: result.data,
  };
}

export function extractPlaceholders(template: string): string[] {
  const seen = new Set<string>();
  const regex = /\{\{([a-zA-Z0-9_]+)\}\}/g;
  let match: RegExpExecArray | null = null;
  while (true) {
    match = regex.exec(template);
    if (!match) break;
    seen.add(String(match[1] || ''));
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}
