import type { Gender } from '../types.js';

export type QwenVoiceEntry = {
  providerId: 'dashscope';
  voiceId: string;
  voiceName: string;
  gender: Gender;
  language: string;
};

// Source: Qwen TTS system voices (aligned with step3 mock catalog and Aliyun docs)
const QWEN_SYSTEM_VOICES: QwenVoiceEntry[] = [
  { providerId: 'dashscope', voiceId: 'Cherry', voiceName: '芊悦', gender: 'female', language: 'zh-cn' },
  { providerId: 'dashscope', voiceId: 'Serena', voiceName: '苏瑶', gender: 'female', language: 'zh-cn' },
  { providerId: 'dashscope', voiceId: 'Chelsie', voiceName: '千雪', gender: 'female', language: 'zh-cn' },
  { providerId: 'dashscope', voiceId: 'Momo', voiceName: '茉兔', gender: 'female', language: 'zh-cn' },
  { providerId: 'dashscope', voiceId: 'Vivian', voiceName: '十三', gender: 'female', language: 'zh-cn' },
  { providerId: 'dashscope', voiceId: 'Maia', voiceName: '四月', gender: 'female', language: 'zh-cn' },
  { providerId: 'dashscope', voiceId: 'Bella', voiceName: '萌宝', gender: 'female', language: 'zh-cn' },
  { providerId: 'dashscope', voiceId: 'Jennifer', voiceName: '詹妮弗', gender: 'female', language: 'en-us' },
  { providerId: 'dashscope', voiceId: 'Katerina', voiceName: '卡捷琳娜', gender: 'female', language: 'ru-ru' },
  { providerId: 'dashscope', voiceId: 'Mia', voiceName: '乖小妹', gender: 'female', language: 'zh-cn' },
  { providerId: 'dashscope', voiceId: 'Stella', voiceName: '少女阿月', gender: 'female', language: 'zh-cn' },
  { providerId: 'dashscope', voiceId: 'Ethan', voiceName: '晨煦', gender: 'male', language: 'zh-cn' },
  { providerId: 'dashscope', voiceId: 'Moon', voiceName: '月白', gender: 'male', language: 'zh-cn' },
  { providerId: 'dashscope', voiceId: 'Kai', voiceName: '凯', gender: 'male', language: 'zh-cn' },
  { providerId: 'dashscope', voiceId: 'Nofish', voiceName: '不吃鱼', gender: 'male', language: 'zh-cn' },
  { providerId: 'dashscope', voiceId: 'Ryan', voiceName: '甜茶', gender: 'male', language: 'zh-cn' },
  { providerId: 'dashscope', voiceId: 'Aiden', voiceName: '艾登', gender: 'male', language: 'en-us' },
  { providerId: 'dashscope', voiceId: 'Vincent', voiceName: '田叔', gender: 'male', language: 'zh-cn' },
  { providerId: 'dashscope', voiceId: 'Neil', voiceName: '阿闻', gender: 'male', language: 'zh-cn' },
  { providerId: 'dashscope', voiceId: 'Arthur', voiceName: '徐大爷', gender: 'male', language: 'zh-cn' },
  { providerId: 'dashscope', voiceId: 'Andre', voiceName: '安德雷', gender: 'male', language: 'zh-cn' },
];

function normalizeModel(model?: string): string {
  return String(model || '').trim().toLowerCase();
}

export function isQwenSystemTtsModel(model?: string): boolean {
  const normalized = normalizeModel(model);
  if (!normalized) return false;
  if (normalized.includes('voice-design')) return false;
  if (normalized.includes('tts-vd')) return false;
  return normalized.includes('qwen3-tts') || normalized.includes('qwen-tts');
}

export function getQwenSystemVoices(): QwenVoiceEntry[] {
  return [...QWEN_SYSTEM_VOICES];
}

