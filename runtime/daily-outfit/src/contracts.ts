export const DAILY_OUTFIT_MOD_ID = 'world.nimi.daily-outfit';

export const DAILY_OUTFIT_NAV_SLOT = 'ui-extension.app.sidebar.mods';
export const DAILY_OUTFIT_ROUTE_SLOT = 'ui-extension.app.content.routes';

export const DAILY_OUTFIT_DATA_API_WARDROBE_LIST = 'data-api.daily-outfit.wardrobe.list';
export const DAILY_OUTFIT_DATA_API_WARDROBE_GET = 'data-api.daily-outfit.wardrobe.get';
export const DAILY_OUTFIT_DATA_API_WARDROBE_CREATE = 'data-api.daily-outfit.wardrobe.create';
export const DAILY_OUTFIT_DATA_API_WARDROBE_UPDATE = 'data-api.daily-outfit.wardrobe.update';
export const DAILY_OUTFIT_DATA_API_WARDROBE_RETIRE = 'data-api.daily-outfit.wardrobe.retire';
export const DAILY_OUTFIT_DATA_API_OUTFITS_LIST = 'data-api.daily-outfit.outfits.list';
export const DAILY_OUTFIT_DATA_API_OUTFITS_GET = 'data-api.daily-outfit.outfits.get';
export const DAILY_OUTFIT_DATA_API_OUTFITS_FAVORITES = 'data-api.daily-outfit.outfits.favorites';
export const DAILY_OUTFIT_DATA_API_PROFILE_READ = 'data-api.daily-outfit.profile.read';
export const DAILY_OUTFIT_DATA_API_PROFILE_WRITE = 'data-api.daily-outfit.profile.write';
export const DAILY_OUTFIT_DATA_API_INSIGHTS_QUERY = 'data-api.daily-outfit.insights.query';
export const DAILY_OUTFIT_DATA_API_WEARLOG_LIST = 'data-api.daily-outfit.wearlog.list';
export const DAILY_OUTFIT_DATA_API_WEARLOG_CREATE = 'data-api.daily-outfit.wearlog.create';

export const DAILY_OUTFIT_CAPABILITIES = [
  'runtime.ai.text.generate',
  'runtime.ai.text.stream',
  'runtime.media.image.generate',
  'runtime.route.list.options',
  'runtime.route.resolve',
  `data.register.${DAILY_OUTFIT_DATA_API_WARDROBE_LIST}`,
  `data.register.${DAILY_OUTFIT_DATA_API_WARDROBE_GET}`,
  `data.register.${DAILY_OUTFIT_DATA_API_WARDROBE_CREATE}`,
  `data.register.${DAILY_OUTFIT_DATA_API_WARDROBE_UPDATE}`,
  `data.register.${DAILY_OUTFIT_DATA_API_WARDROBE_RETIRE}`,
  `data.register.${DAILY_OUTFIT_DATA_API_OUTFITS_LIST}`,
  `data.register.${DAILY_OUTFIT_DATA_API_OUTFITS_GET}`,
  `data.register.${DAILY_OUTFIT_DATA_API_OUTFITS_FAVORITES}`,
  `data.register.${DAILY_OUTFIT_DATA_API_PROFILE_READ}`,
  `data.register.${DAILY_OUTFIT_DATA_API_PROFILE_WRITE}`,
  `data.register.${DAILY_OUTFIT_DATA_API_INSIGHTS_QUERY}`,
  `data.register.${DAILY_OUTFIT_DATA_API_WEARLOG_LIST}`,
  `data.register.${DAILY_OUTFIT_DATA_API_WEARLOG_CREATE}`,
  `ui.register.${DAILY_OUTFIT_NAV_SLOT}`,
  `ui.register.${DAILY_OUTFIT_ROUTE_SLOT}`,
] as const;
