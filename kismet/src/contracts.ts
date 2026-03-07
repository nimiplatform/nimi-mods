export const KISMET_MOD_ID = 'world.nimi.kismet';

export const KISMET_NAV_SLOT = 'ui-extension.app.sidebar.mods';
export const KISMET_ROUTE_SLOT = 'ui-extension.app.content.routes';

export const KISMET_CAPABILITIES = [
  'runtime.ai.text.generate',
  'runtime.route.list.options',
  'runtime.route.resolve',
  'runtime.route.check.health',
  `ui.register.${KISMET_NAV_SLOT}`,
  `ui.register.${KISMET_ROUTE_SLOT}`,
] as const;

export const KISMET_PERMISSIONS = [...KISMET_CAPABILITIES] as const;
export const KISMET_RUNTIME_TEXT_CAPABILITY = 'text.generate' as const;

export const KISMET_AUDIT = {
  BIRTH_INPUT_DERIVED: 'kismet.birth-input.derived',
  PROFILE_CONFIRMED: 'kismet.profile.confirmed',
  LOCAL_PROFILE_SAVED: 'kismet.local-profile.saved',
  LOCAL_PROFILE_REMOVED: 'kismet.local-profile.removed',
  PROMPT_COPIED: 'kismet.prompt.copied',
  IMPORT_STARTED: 'kismet.import.started',
  IMPORT_FAILED: 'kismet.import.failed',
  IMPORT_SUCCEEDED: 'kismet.import.succeeded',
  NATAL_GENERATE_STARTED: 'kismet.natal.generate.started',
  NATAL_GENERATE_FAILED: 'kismet.natal.generate.failed',
  NATAL_GENERATE_SUCCEEDED: 'kismet.natal.generate.succeeded',
  DAILY_GENERATE_STARTED: 'kismet.daily.generate.started',
  DAILY_GENERATE_FAILED: 'kismet.daily.generate.failed',
  DAILY_GENERATE_SUCCEEDED: 'kismet.daily.generate.succeeded',
  COMPATIBILITY_GENERATE_STARTED: 'kismet.compatibility.generate.started',
  COMPATIBILITY_GENERATE_FAILED: 'kismet.compatibility.generate.failed',
  COMPATIBILITY_GENERATE_SUCCEEDED: 'kismet.compatibility.generate.succeeded',
  FALLBACK_TO_IMPORT: 'kismet.fallback.to-import-mode',
  EXPORT_JSON: 'kismet.export.json',
  EXPORT_PDF: 'kismet.export.pdf',
  EXPORT_HTML: 'kismet.export.html',
  FORTUNE_STICK_GENERATE_STARTED: 'kismet.fortune-stick.generate.started',
  FORTUNE_STICK_GENERATE_FAILED: 'kismet.fortune-stick.generate.failed',
  FORTUNE_STICK_GENERATE_SUCCEEDED: 'kismet.fortune-stick.generate.succeeded',
  SHARE_COPIED: 'kismet.share.copied',
  PRIMARY_PROFILE_RESTORED: 'kismet.primary-profile.restored',
} as const;

export const KISMET_REASON = {
  INPUT_INVALID: 'KISMET_INPUT_INVALID',
  BIRTH_PLACE_UNRESOLVED: 'KISMET_BIRTH_PLACE_UNRESOLVED',
  CANONICAL_PROFILE_INVALID: 'KISMET_CANONICAL_PROFILE_INVALID',
  DAILY_CONTEXT_INVALID: 'KISMET_DAILY_CONTEXT_INVALID',
  COMPATIBILITY_INPUT_INVALID: 'KISMET_COMPATIBILITY_INPUT_INVALID',
  LOCAL_PROFILE_CONSENT_REQUIRED: 'KISMET_LOCAL_PROFILE_CONSENT_REQUIRED',
  LOCAL_PROFILE_NOT_FOUND: 'KISMET_LOCAL_PROFILE_NOT_FOUND',
  RESULT_SCHEMA_INVALID: 'KISMET_RESULT_SCHEMA_INVALID',
  RESULT_POINTS_INVALID: 'KISMET_RESULT_POINTS_INVALID',
  ROUTE_UNAVAILABLE: 'KISMET_ROUTE_UNAVAILABLE',
  AI_GENERATE_FAILED: 'KISMET_AI_GENERATE_FAILED',
  IMPORT_PARSE_FAILED: 'KISMET_IMPORT_PARSE_FAILED',
  FORTUNE_STICK_FAILED: 'KISMET_FORTUNE_STICK_FAILED',
} as const;

export const ANALYSIS_DIMENSIONS = [
  'summary',
  'personality',
  'industry',
  'fengShui',
  'wealth',
  'marriage',
  'health',
  'family',
  'crypto',
] as const;

export const TAB_LABELS = {
  'natal-profile': '命盘分析',
  'daily-fortune': '今日运势',
  compatibility: '命理匹配',
} as const;

export type AnalysisDimensionKey = (typeof ANALYSIS_DIMENSIONS)[number];
