export const KISMET_MOD_ID = 'world.nimi.kismet';

export const KISMET_NAV_SLOT = 'ui-extension.app.sidebar.mods';
export const KISMET_ROUTE_SLOT = 'ui-extension.app.content.routes';

export const KISMET_DATA_API_RUNTIME_ROUTE_OPTIONS = 'data-api.runtime.route.options';

export const KISMET_CAPABILITIES = [
  'llm.text.generate',
  'llm.text.stream',
  `data.query.${KISMET_DATA_API_RUNTIME_ROUTE_OPTIONS}`,
  `ui.register.${KISMET_NAV_SLOT}`,
  `ui.register.${KISMET_ROUTE_SLOT}`,
] as const;

export const KISMET_PERMISSIONS = [...KISMET_CAPABILITIES] as const;

export const KISMET_AUDIT = {
  INPUT_SUBMITTED: 'kismet.input.submitted',
  PROMPT_COPIED: 'kismet.prompt.copied',
  IMPORT_STARTED: 'kismet.import.started',
  IMPORT_FAILED: 'kismet.import.failed',
  IMPORT_SUCCEEDED: 'kismet.import.succeeded',
  AI_GENERATE_STARTED: 'kismet.ai.generate.started',
  AI_GENERATE_FAILED: 'kismet.ai.generate.failed',
  AI_GENERATE_SUCCEEDED: 'kismet.ai.generate.succeeded',
  FALLBACK_TO_IMPORT: 'kismet.fallback.to-import-mode',
  EXPORT_JSON: 'kismet.export.json',
  EXPORT_PDF: 'kismet.export.pdf',
  EXPORT_HTML: 'kismet.export.html',
} as const;

export const KISMET_REASON = {
  INPUT_INVALID: 'KISMET_INPUT_INVALID',
  RESULT_SCHEMA_INVALID: 'KISMET_RESULT_SCHEMA_INVALID',
  RESULT_POINTS_INVALID: 'KISMET_RESULT_POINTS_INVALID',
  ROUTE_UNAVAILABLE: 'KISMET_ROUTE_UNAVAILABLE',
  AI_GENERATE_FAILED: 'KISMET_AI_GENERATE_FAILED',
  IMPORT_PARSE_FAILED: 'KISMET_IMPORT_PARSE_FAILED',
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

export type AnalysisDimensionKey = (typeof ANALYSIS_DIMENSIONS)[number];
