import type { ElementKey } from '../../types.js';

export const HEAVENLY_STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'] as const;

export const EARTHLY_BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'] as const;

export const STEM_TO_ELEMENT: Record<(typeof HEAVENLY_STEMS)[number], ElementKey> = {
  '甲': 'wood',
  '乙': 'wood',
  '丙': 'fire',
  '丁': 'fire',
  '戊': 'earth',
  '己': 'earth',
  '庚': 'metal',
  '辛': 'metal',
  '壬': 'water',
  '癸': 'water',
};

export const STEM_TO_YIN_YANG: Record<(typeof HEAVENLY_STEMS)[number], 'yin' | 'yang'> = {
  '甲': 'yang',
  '乙': 'yin',
  '丙': 'yang',
  '丁': 'yin',
  '戊': 'yang',
  '己': 'yin',
  '庚': 'yang',
  '辛': 'yin',
  '壬': 'yang',
  '癸': 'yin',
};

export const BRANCH_TO_ELEMENT: Record<(typeof EARTHLY_BRANCHES)[number], ElementKey> = {
  '子': 'water',
  '丑': 'earth',
  '寅': 'wood',
  '卯': 'wood',
  '辰': 'earth',
  '巳': 'fire',
  '午': 'fire',
  '未': 'earth',
  '申': 'metal',
  '酉': 'metal',
  '戌': 'earth',
  '亥': 'water',
};

export const BRANCH_TO_ZODIAC: Record<(typeof EARTHLY_BRANCHES)[number], string> = {
  '子': '鼠',
  '丑': '牛',
  '寅': '虎',
  '卯': '兔',
  '辰': '龙',
  '巳': '蛇',
  '午': '马',
  '未': '羊',
  '申': '猴',
  '酉': '鸡',
  '戌': '狗',
  '亥': '猪',
};

export const GENERATES: Record<ElementKey, ElementKey> = {
  wood: 'fire',
  fire: 'earth',
  earth: 'metal',
  metal: 'water',
  water: 'wood',
};

export const GENERATED_BY: Record<ElementKey, ElementKey> = {
  wood: 'water',
  fire: 'wood',
  earth: 'fire',
  metal: 'earth',
  water: 'metal',
};

export const CONTROLS: Record<ElementKey, ElementKey> = {
  wood: 'earth',
  fire: 'metal',
  earth: 'water',
  metal: 'wood',
  water: 'fire',
};

export const CONTROLLED_BY: Record<ElementKey, ElementKey> = {
  wood: 'metal',
  fire: 'water',
  earth: 'wood',
  metal: 'fire',
  water: 'earth',
};

export const ELEMENT_LABELS: Record<ElementKey, string> = {
  metal: '金',
  wood: '木',
  water: '水',
  fire: '火',
  earth: '土',
};

export const ELEMENT_ARCHETYPES: Record<ElementKey, string> = {
  metal: '金系命格',
  wood: '木系命格',
  water: '水系命格',
  fire: '火系命格',
  earth: '土系命格',
};

export const LUCK_DIRECTIONS: Record<ElementKey, string[]> = {
  metal: ['西', '西北'],
  wood: ['东', '东南'],
  water: ['北', '东北'],
  fire: ['南', '东南'],
  earth: ['中宫', '西南'],
};

export const LUCK_COLORS: Record<ElementKey, string[]> = {
  metal: ['银白', '金色'],
  wood: ['青绿', '翠色'],
  water: ['深蓝', '墨黑'],
  fire: ['赤红', '橙色'],
  earth: ['赭黄', '棕色'],
};
