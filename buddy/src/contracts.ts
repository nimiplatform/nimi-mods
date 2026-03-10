export const MOD_ID = 'world.nimi.buddy';

export const NAV_SLOT = 'ui-extension.app.sidebar.mods';
export const ROUTE_SLOT = 'ui-extension.app.content.routes';
export const TAB_ID = 'mod:buddy';

export const MOD_CAPABILITIES = [
  'runtime.ai.text.generate',
  'runtime.ai.text.stream',
  'runtime.media.tts.stream',
  'runtime.media.tts.synthesize',
  'runtime.media.tts.list.voices',
  'runtime.media.stt.transcribe',
  'runtime.route.list.options',
  'runtime.route.resolve',
  'runtime.route.check.health',
  'data.store.mod-state',
  `ui.register.${NAV_SLOT}`,
  `ui.register.${ROUTE_SLOT}`,
] as const;

export const BUDDY_SESSION_VERSION = 1;

export const BUDDY_MODELS = [
  {
    id: 'haru',
    label: '春（Haru）',
    relativePath: 'haru/haru.model3.json',
  },
  {
    id: 'haru_greeter',
    label: '春・接待版',
    relativePath: 'haru_greeter/haru_greeter_t05.model3.json',
  },
  {
    id: 'hiyori',
    label: '日和（Hiyori）',
    relativePath: 'hiyori/hiyori_pro_t11.model3.json',
  },
] as const;

export type BuddyModelId = typeof BUDDY_MODELS[number]['id'];

export const DEFAULT_BUDDY_MODEL_ID: BuddyModelId = 'haru';

/** 情绪标签正则 */
export const EMOTION_TAG_REGEX = /\[emotion:(happy|sad|surprised|thinking|excited|sleepy)\]/;

/** 支持的情绪类型 */
export type EmotionType = 'happy' | 'sad' | 'surprised' | 'thinking' | 'excited' | 'sleepy';

/** 默认情绪（儿童陪伴场景应默认积极） */
export const DEFAULT_EMOTION: EmotionType = 'happy';

export const LIP_SYNC_PHONEMES = ['A', 'E', 'I', 'O', 'U', 'S'] as const;

export type LipSyncPhoneme = typeof LIP_SYNC_PHONEMES[number];

export type LipSyncPhonemeWeights = Record<LipSyncPhoneme, number>;

export interface LipSyncFrame {
  rms: number;
  dominantPhoneme: LipSyncPhoneme;
  phonemes: LipSyncPhonemeWeights;
  mfcc: number[];
}

/** 对话历史最大保留轮数 */
export const MAX_HISTORY_TURNS = 20;

/** 休息提醒间隔（毫秒） */
export const REST_REMINDER_INTERVAL_MS = 30 * 60 * 1000;

/** 休息提醒自动重置的空闲时间（毫秒） */
export const REST_REMINDER_IDLE_RESET_MS = 5 * 60 * 1000;
