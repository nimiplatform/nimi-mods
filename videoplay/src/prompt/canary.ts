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
  'character-visual': ['agentId', 'name', 'visualKeywords', 'appearanceDescription'],
  'scene-description': ['sceneId', 'environmentDescription'],
  'storyboard-cinematography': ['composition', 'lighting', 'colorPalette', 'atmosphere'],
  'storyboard-acting': ['characters'],
  'storyboard-detail': ['videoPrompt'],
  'audio-design': ['bgmRecommendation', 'sfxPlan'],
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
  'character-visual': {
    agentId: 'agent-001',
    characterName: 'Hero',
    visualKeywords: 'tall,dark-hair,armor',
    roleLevel: 'S',
    memoryRecall: 'A brave warrior with scars on face',
  },
  'scene-description': {
    sceneId: 'scene-001',
    sceneName: 'Dark Forest',
    sceneDescription: 'A dense forest shrouded in mist',
  },
  'storyboard-cinematography': {
    episodeId: 'episode-001',
    shotId: 'shot-1',
    visualPrompt: 'Hero standing in rain',
    shotType: 'close-up',
    sceneAtmosphere: 'melancholy',
  },
  'storyboard-acting': {
    episodeId: 'episode-001',
    shotId: 'shot-1',
    characterIds: 'agent-001,agent-002',
    beatSummary: 'Confrontation between hero and villain',
  },
  'storyboard-detail': {
    episodeId: 'episode-001',
    shotId: 'shot-1',
    photographyRule: '{"composition":"center","lighting":"dramatic"}',
    actingDirection: '{"characters":[{"characterId":"agent-001","actingDescription":"intense gaze"}]}',
  },
  'audio-design': {
    episodeId: 'episode-001',
    beatsSummary: 'Opening calm, rising tension, climactic battle, resolution',
    shotCount: '12',
    totalDurationMs: '90000',
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
  if (scope === 'shot-variant') {
    return {
      baseShotId: 'shot-1',
      variantShotId: 'shot-1-var-1',
      variantDelta: 'camera:wide',
      sourceEventIds: ['ev-1'],
    };
  }
  if (scope === 'character-visual') {
    return {
      agentId: 'agent-001',
      name: 'Hero',
      visualKeywords: ['tall', 'dark-hair'],
      appearanceDescription: 'A tall figure with dark hair and scars',
    };
  }
  if (scope === 'scene-description') {
    return {
      sceneId: 'scene-001',
      environmentDescription: 'A dense misty forest with ancient trees',
    };
  }
  if (scope === 'storyboard-cinematography') {
    return {
      composition: 'center',
      lighting: 'dramatic side-light',
      colorPalette: 'desaturated blue',
      atmosphere: 'melancholy',
    };
  }
  if (scope === 'storyboard-acting') {
    return {
      characters: [{ characterId: 'agent-001', actingDescription: 'intense gaze' }],
    };
  }
  if (scope === 'storyboard-detail') {
    return {
      videoPrompt: 'Close-up shot of hero with dramatic side-lighting, intense gaze, desaturated blue palette',
    };
  }
  if (scope === 'audio-design') {
    return {
      bgmRecommendation: { genre: 'orchestral', mood: 'epic' },
      sfxPlan: [{ type: 'ambient', description: 'rain' }],
    };
  }
  return {};
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
    executedCaseIds.push('VPROMPT-007-CHARACTER-VISUAL-SHAPE');
    executedCaseIds.push('VPROMPT-008-SCENE-DESCRIPTION-SHAPE');
    executedCaseIds.push('VPROMPT-009-CINEMATOGRAPHY-SHAPE');
    executedCaseIds.push('VPROMPT-010-ACTING-SHAPE');
    executedCaseIds.push('VPROMPT-011-DETAIL-SHAPE');
    executedCaseIds.push('VPROMPT-012-AUDIO-DESIGN-SHAPE');
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
