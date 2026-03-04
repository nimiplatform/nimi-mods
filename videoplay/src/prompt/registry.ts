import { z } from 'zod';
import { VIDEOPLAY_PROMPT_ID } from '../contracts.js';

export type VideoPlayPromptScope =
  | 'storyboard-plan'
  | 'shot-rewrite'
  | 'shot-variant'
  | 'character-visual'
  | 'scene-description'
  | 'storyboard-cinematography'
  | 'storyboard-acting'
  | 'storyboard-detail'
  | 'audio-design';

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

export const CharacterVisualVariableSchema = z.object({
  agentId: z.string().min(1),
  characterName: z.string().min(1),
  visualKeywords: z.string().min(1),
  roleLevel: z.string().min(1),
  memoryRecall: z.string().min(1),
});

export const SceneDescriptionVariableSchema = z.object({
  sceneId: z.string().min(1),
  sceneName: z.string().min(1),
  sceneDescription: z.string().min(1),
});

export const StoryboardCinematographyVariableSchema = z.object({
  episodeId: z.string().min(1),
  shotId: z.string().min(1),
  visualPrompt: z.string().min(1),
  shotType: z.string().min(1),
  sceneAtmosphere: z.string().min(1),
});

export const StoryboardActingVariableSchema = z.object({
  episodeId: z.string().min(1),
  shotId: z.string().min(1),
  characterIds: z.string().min(1),
  beatSummary: z.string().min(1),
});

export const StoryboardDetailVariableSchema = z.object({
  episodeId: z.string().min(1),
  shotId: z.string().min(1),
  photographyRule: z.string().min(1),
  actingDirection: z.string().min(1),
});

export const AudioDesignVariableSchema = z.object({
  episodeId: z.string().min(1),
  beatsSummary: z.string().min(1),
  shotCount: z.string().min(1),
  totalDurationMs: z.string().min(1),
});

export const PROMPT_VARIABLE_SCHEMA = {
  'storyboard-plan': StoryboardPlanVariableSchema,
  'shot-rewrite': ShotRewriteVariableSchema,
  'shot-variant': ShotVariantVariableSchema,
  'character-visual': CharacterVisualVariableSchema,
  'scene-description': SceneDescriptionVariableSchema,
  'storyboard-cinematography': StoryboardCinematographyVariableSchema,
  'storyboard-acting': StoryboardActingVariableSchema,
  'storyboard-detail': StoryboardDetailVariableSchema,
  'audio-design': AudioDesignVariableSchema,
} as const;

const TEMPLATES: VideoPlayPromptTemplate[] = [
  // --- storyboard-plan ---
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
  // --- shot-rewrite ---
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
  // --- shot-variant ---
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
  // --- character-visual ---
  {
    promptId: VIDEOPLAY_PROMPT_ID.CHARACTER_VISUAL,
    scope: 'character-visual',
    locale: 'zh',
    template: [
      '你是角色外观设计师。',
      'agentId={{agentId}}',
      'characterName={{characterName}}',
      'visualKeywords={{visualKeywords}}',
      'roleLevel={{roleLevel}}',
      'memoryRecall={{memoryRecall}}',
      '输出角色外观描述 JSON，字段包含: agentId, name, visualKeywords, appearanceDescription, referencePrompt。',
    ].join('\n'),
  },
  {
    promptId: VIDEOPLAY_PROMPT_ID.CHARACTER_VISUAL,
    scope: 'character-visual',
    locale: 'en',
    template: [
      'You are a character appearance designer.',
      'agentId={{agentId}}',
      'characterName={{characterName}}',
      'visualKeywords={{visualKeywords}}',
      'roleLevel={{roleLevel}}',
      'memoryRecall={{memoryRecall}}',
      'Return character appearance JSON with fields: agentId, name, visualKeywords, appearanceDescription, referencePrompt.',
    ].join('\n'),
  },
  // --- scene-description ---
  {
    promptId: VIDEOPLAY_PROMPT_ID.SCENE_DESCRIPTION,
    scope: 'scene-description',
    locale: 'zh',
    template: [
      '你是场景环境描述师。',
      'sceneId={{sceneId}}',
      'sceneName={{sceneName}}',
      'sceneDescription={{sceneDescription}}',
      '输出场景环境描述 JSON，字段包含: sceneId, environmentDescription, referencePrompt。',
    ].join('\n'),
  },
  {
    promptId: VIDEOPLAY_PROMPT_ID.SCENE_DESCRIPTION,
    scope: 'scene-description',
    locale: 'en',
    template: [
      'You are a scene environment designer.',
      'sceneId={{sceneId}}',
      'sceneName={{sceneName}}',
      'sceneDescription={{sceneDescription}}',
      'Return scene environment JSON with fields: sceneId, environmentDescription, referencePrompt.',
    ].join('\n'),
  },
  // --- storyboard-cinematography ---
  {
    promptId: VIDEOPLAY_PROMPT_ID.STORYBOARD_CINEMATOGRAPHY,
    scope: 'storyboard-cinematography',
    locale: 'zh',
    template: [
      '你是摄影指导。',
      'episodeId={{episodeId}}',
      'shotId={{shotId}}',
      'visualPrompt={{visualPrompt}}',
      'shotType={{shotType}}',
      'sceneAtmosphere={{sceneAtmosphere}}',
      '输出摄影规则 JSON，字段包含: composition, lighting, colorPalette, atmosphere, technicalNotes。',
    ].join('\n'),
  },
  {
    promptId: VIDEOPLAY_PROMPT_ID.STORYBOARD_CINEMATOGRAPHY,
    scope: 'storyboard-cinematography',
    locale: 'en',
    template: [
      'You are a director of photography.',
      'episodeId={{episodeId}}',
      'shotId={{shotId}}',
      'visualPrompt={{visualPrompt}}',
      'shotType={{shotType}}',
      'sceneAtmosphere={{sceneAtmosphere}}',
      'Return photography rule JSON with fields: composition, lighting, colorPalette, atmosphere, technicalNotes.',
    ].join('\n'),
  },
  // --- storyboard-acting ---
  {
    promptId: VIDEOPLAY_PROMPT_ID.STORYBOARD_ACTING,
    scope: 'storyboard-acting',
    locale: 'zh',
    template: [
      '你是演技指导。',
      'episodeId={{episodeId}}',
      'shotId={{shotId}}',
      'characterIds={{characterIds}}',
      'beatSummary={{beatSummary}}',
      '输出演技指导 JSON，字段包含: characters (数组，每项含 characterId, actingDescription)。',
    ].join('\n'),
  },
  {
    promptId: VIDEOPLAY_PROMPT_ID.STORYBOARD_ACTING,
    scope: 'storyboard-acting',
    locale: 'en',
    template: [
      'You are an acting director.',
      'episodeId={{episodeId}}',
      'shotId={{shotId}}',
      'characterIds={{characterIds}}',
      'beatSummary={{beatSummary}}',
      'Return acting direction JSON with fields: characters (array of characterId, actingDescription).',
    ].join('\n'),
  },
  // --- storyboard-detail ---
  {
    promptId: VIDEOPLAY_PROMPT_ID.STORYBOARD_DETAIL,
    scope: 'storyboard-detail',
    locale: 'zh',
    template: [
      '你是分镜细节合并器。',
      'episodeId={{episodeId}}',
      'shotId={{shotId}}',
      'photographyRule={{photographyRule}}',
      'actingDirection={{actingDirection}}',
      '输出最终 videoPrompt 字段：结合摄影规则和演技指导，生成用于图像/视频生成的完整提示词。',
    ].join('\n'),
  },
  {
    promptId: VIDEOPLAY_PROMPT_ID.STORYBOARD_DETAIL,
    scope: 'storyboard-detail',
    locale: 'en',
    template: [
      'You are a storyboard detail merger.',
      'episodeId={{episodeId}}',
      'shotId={{shotId}}',
      'photographyRule={{photographyRule}}',
      'actingDirection={{actingDirection}}',
      'Output the final videoPrompt field: combine photography rules and acting direction into a complete generation prompt.',
    ].join('\n'),
  },
  // --- audio-design ---
  {
    promptId: VIDEOPLAY_PROMPT_ID.AUDIO_DESIGN,
    scope: 'audio-design',
    locale: 'zh',
    template: [
      '你是音频设计师。',
      'episodeId={{episodeId}}',
      'beatsSummary={{beatsSummary}}',
      'shotCount={{shotCount}}',
      'totalDurationMs={{totalDurationMs}}',
      '输出音频设计 JSON，字段包含: bgmRecommendation, sfxPlan, emotionArc。',
    ].join('\n'),
  },
  {
    promptId: VIDEOPLAY_PROMPT_ID.AUDIO_DESIGN,
    scope: 'audio-design',
    locale: 'en',
    template: [
      'You are an audio designer.',
      'episodeId={{episodeId}}',
      'beatsSummary={{beatsSummary}}',
      'shotCount={{shotCount}}',
      'totalDurationMs={{totalDurationMs}}',
      'Return audio design JSON with fields: bgmRecommendation, sfxPlan, emotionArc.',
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
  return [
    'storyboard-plan',
    'shot-rewrite',
    'shot-variant',
    'character-visual',
    'scene-description',
    'storyboard-cinematography',
    'storyboard-acting',
    'storyboard-detail',
    'audio-design',
  ];
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
