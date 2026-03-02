import {
  assertPromptLocaleParity,
  ensurePromptTemplateRegistered,
  extractPlaceholders,
  findPromptTemplate,
  getPromptFallbackLocale,
  listPromptLocales,
  listPromptScopes,
  listPromptTemplates,
  renderPromptTemplate,
  resolvePromptLocale,
  validatePromptVariables,
  type VideoPlayPromptScope,
} from './registry.js';

const REQUIRED_STRUCTURED_FIELDS: Record<VideoPlayPromptScope, string[]> = {
  'storyboard-plan': ['episodeId', 'clipPlans', 'shotPlans', 'sourceEventIds'],
  'shot-rewrite': ['shotId', 'visualPrompt', 'motionCue', 'continuityAnchors'],
  'shot-variant': ['baseShotId', 'variantShotId', 'variantDelta', 'sourceEventIds'],
};

const SAMPLE_VARIABLES: Record<VideoPlayPromptScope, Record<string, string>> = {
  'storyboard-plan': {
    storyId: 'story-001',
    episodeId: 'episode-001',
    worldStyle: 'neo noir',
    beatsJson: '[{"beatId":"beat-1"}]',
  },
  'shot-rewrite': {
    episodeId: 'episode-001',
    shotId: 'shot-1',
    sourceEventIds: 'ev-1,ev-2',
    styleHint: 'cinematic close-up',
  },
  'shot-variant': {
    episodeId: 'episode-001',
    baseShotId: 'shot-1',
    sourceEventIds: 'ev-1,ev-2',
    variantInstruction: 'slower push-in',
  },
};

function mockStructuredOutput(scope: VideoPlayPromptScope): Record<string, unknown> {
  if (scope === 'storyboard-plan') {
    return {
      episodeId: 'episode-001',
      clipPlans: [{ clipId: 'clip-1' }],
      shotPlans: [{ shotId: 'shot-1' }],
      sourceEventIds: ['ev-1'],
    };
  }
  if (scope === 'shot-rewrite') {
    return {
      shotId: 'shot-1',
      visualPrompt: 'A hero standing under rain.',
      motionCue: 'slow dolly in',
      continuityAnchors: ['wardrobe:coat'],
    };
  }
  return {
    baseShotId: 'shot-1',
    variantShotId: 'shot-1-var-1',
    variantDelta: 'camera:wide',
    sourceEventIds: ['ev-1'],
  };
}

function checkRequiredFields(scope: VideoPlayPromptScope): string[] {
  const output = mockStructuredOutput(scope);
  return REQUIRED_STRUCTURED_FIELDS[scope].filter((field) => !(field in output));
}

export type PromptCanaryReport = {
  ok: boolean;
  executedCaseIds: string[];
  failures: string[];
};

export function runPromptCanaryCases(): PromptCanaryReport {
  const failures: string[] = [];
  const executedCaseIds: string[] = [];
  const scopes: VideoPlayPromptScope[] = listPromptScopes();
  const templates = listPromptTemplates();

  executedCaseIds.push('VPROMPT-004-PLACEHOLDER-PARITY-ZH-EN');
  const baselineLocales = listPromptLocales();
  if (JSON.stringify(baselineLocales) !== JSON.stringify(['zh', 'en'])) {
    failures.push('locale-baseline:must-include-zh-en');
  }
  if (getPromptFallbackLocale() !== 'zh') {
    failures.push('locale-baseline:fallback-must-be-zh');
  }
  if (resolvePromptLocale('unknown') !== 'zh') {
    failures.push('locale-baseline:unknown-must-fallback-zh');
  }

  for (const scope of scopes) {
    executedCaseIds.push('VPROMPT-006-CATALOG-TEMPLATE-DRIFT');
    const registryState = ensurePromptTemplateRegistered(scope);
    if (!registryState.ok) {
      failures.push(`catalog-template-drift:${scope}:${registryState.reason}`);
    }

    executedCaseIds.push('VPROMPT-004-PLACEHOLDER-PARITY-ZH-EN');
    const localeParity = assertPromptLocaleParity(scope);
    if (!localeParity.ok) {
      failures.push(`locale-parity:${scope}:${localeParity.reason}`);
    }

    const zh = findPromptTemplate(scope, 'zh');
    const en = findPromptTemplate(scope, 'en');
    if (!templates.find((item) => item.promptId === zh.promptId && item.scope === scope && item.locale === 'zh')) {
      failures.push(`catalog-template-drift:${scope}:registry_zh_missing`);
    }
    if (!templates.find((item) => item.promptId === en.promptId && item.scope === scope && item.locale === 'en')) {
      failures.push(`catalog-template-drift:${scope}:registry_en_missing`);
    }

    const zhPlaceholders = extractPlaceholders(zh.template);
    const enPlaceholders = extractPlaceholders(en.template);
    if (JSON.stringify(zhPlaceholders) !== JSON.stringify(enPlaceholders)) {
      failures.push(`locale-parity:${scope}:placeholder_mismatch`);
    }

    executedCaseIds.push('VPROMPT-005-VARIABLE-SCHEMA-VALIDATION');
    const validation = validatePromptVariables(scope, SAMPLE_VARIABLES[scope]);
    if (!validation.ok) {
      failures.push(`variable-schema:${scope}:${validation.issues.join(',')}`);
      continue;
    }

    executedCaseIds.push('VPROMPT-001-STORYBOARD-PLAN-SHAPE');
    executedCaseIds.push('VPROMPT-002-SHOT-REWRITE-SHAPE');
    executedCaseIds.push('VPROMPT-003-VARIANT-GENERATE-SHAPE');
    const renderedZh = renderPromptTemplate(scope, 'zh', validation.data);
    const renderedEn = renderPromptTemplate(scope, 'en', validation.data);
    if (!renderedZh || !renderedEn) {
      failures.push(`render-empty:${scope}`);
    }

    const missingFields = checkRequiredFields(scope);
    if (missingFields.length > 0) {
      failures.push(`shape:${scope}:${missingFields.join(',')}`);
    }
  }

  return {
    ok: failures.length === 0,
    executedCaseIds: [...new Set(executedCaseIds)],
    failures,
  };
}
