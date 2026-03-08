import type { LocalChatProductSettings } from '../../default-settings-store.js';

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

export function hasStoredVoicePreference(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const product = (value as Record<string, unknown>).product;
  if (!product || typeof product !== 'object' || Array.isArray(product)) {
    return false;
  }
  const record = product as Record<string, unknown>;
  return hasOwn(record, 'enableVoice') || hasOwn(record, 'voiceConversationMode');
}

export function shouldAutoPrimeVoiceDefaults(input: {
  alreadyPrimed: boolean;
  rawSettings: unknown;
  productSettings: Pick<LocalChatProductSettings, 'enableVoice' | 'voiceConversationMode'>;
  ttsReady: boolean;
}): boolean {
  if (input.alreadyPrimed || !input.ttsReady) {
    return false;
  }
  if (hasStoredVoicePreference(input.rawSettings)) {
    return false;
  }
  return input.productSettings.enableVoice === false
    && input.productSettings.voiceConversationMode === 'off';
}
