export const MUSIC_SCORE_MOD_ID = 'world.nimi.music-score';
export const MUSIC_SCORE_TAB_ID = 'mod:music-score';

export const MUSIC_SCORE_NAV_SLOT = 'ui-extension.app.sidebar.mods';
export const MUSIC_SCORE_ROUTE_SLOT = 'ui-extension.app.content.routes';

export const MUSIC_SCORE_CAPABILITIES = [
  `ui.register.${MUSIC_SCORE_NAV_SLOT}`,
  `ui.register.${MUSIC_SCORE_ROUTE_SLOT}`,
] as const;
