export const RELIFE_MOD_ID = 'world.nimi.relife';
export const RELIFE_TAB_ID = 'mod:re-life';

export const RELIFE_NAV_SLOT = 'ui-extension.app.sidebar.mods';
export const RELIFE_ROUTE_SLOT = 'ui-extension.app.content.routes';

export const RELIFE_DATA_API_DECISIONS_UPSERT = 'data-api.relife.decisions.upsert';
export const RELIFE_DATA_API_DECISIONS_LIST = 'data-api.relife.decisions.list';
export const RELIFE_DATA_API_DECISIONS_GET = 'data-api.relife.decisions.get';
export const RELIFE_DATA_API_SCENARIOS_UPSERT = 'data-api.relife.scenarios.upsert';
export const RELIFE_DATA_API_SCENARIOS_LIST = 'data-api.relife.scenarios.list';
export const RELIFE_DATA_API_SHARED_PUBLISH = 'data-api.relife.shared.publish';
export const RELIFE_DATA_API_SHARED_REVOKE = 'data-api.relife.shared.revoke';
export const RELIFE_DATA_API_SHARED_LIST = 'data-api.relife.shared.list';
export const RELIFE_DATA_API_METRICS_AGGREGATE = 'data-api.relife.metrics.aggregate';
export const RELIFE_DATA_API_RUNTIME_ROUTE_OPTIONS = 'data-api.runtime.route.options';

export const RELIFE_CAPABILITIES = [
  'llm.text.generate',
  'llm.text.stream',
  'llm.object.generate',
  `data.register.${RELIFE_DATA_API_DECISIONS_UPSERT}`,
  `data.query.${RELIFE_DATA_API_DECISIONS_UPSERT}`,
  `data.register.${RELIFE_DATA_API_DECISIONS_LIST}`,
  `data.query.${RELIFE_DATA_API_DECISIONS_LIST}`,
  `data.register.${RELIFE_DATA_API_DECISIONS_GET}`,
  `data.query.${RELIFE_DATA_API_DECISIONS_GET}`,
  `data.register.${RELIFE_DATA_API_SCENARIOS_UPSERT}`,
  `data.query.${RELIFE_DATA_API_SCENARIOS_UPSERT}`,
  `data.register.${RELIFE_DATA_API_SCENARIOS_LIST}`,
  `data.query.${RELIFE_DATA_API_SCENARIOS_LIST}`,
  `data.register.${RELIFE_DATA_API_SHARED_PUBLISH}`,
  `data.query.${RELIFE_DATA_API_SHARED_PUBLISH}`,
  `data.register.${RELIFE_DATA_API_SHARED_REVOKE}`,
  `data.query.${RELIFE_DATA_API_SHARED_REVOKE}`,
  `data.register.${RELIFE_DATA_API_SHARED_LIST}`,
  `data.query.${RELIFE_DATA_API_SHARED_LIST}`,
  `data.register.${RELIFE_DATA_API_METRICS_AGGREGATE}`,
  `data.query.${RELIFE_DATA_API_METRICS_AGGREGATE}`,
  `data.query.${RELIFE_DATA_API_RUNTIME_ROUTE_OPTIONS}`,
  `ui.register.${RELIFE_NAV_SLOT}`,
  `ui.register.${RELIFE_ROUTE_SLOT}`,
] as const;

export const RELIFE_PERMISSIONS = [...RELIFE_CAPABILITIES] as const;
