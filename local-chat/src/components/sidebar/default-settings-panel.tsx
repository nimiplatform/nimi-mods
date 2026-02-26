import React from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import { LOCAL_CHAT_TTS_VOICE_OPTIONS } from '../../state/index.js';
import type { RuntimeStatusSidebarProps } from './types.js';

type Props = {
  open: boolean;
  onToggle: () => void;
  defaultSettings: RuntimeStatusSidebarProps['defaultSettings'];
  speechVoices: RuntimeStatusSidebarProps['speechVoices'];
  onDefaultSettingChange: RuntimeStatusSidebarProps['onDefaultSettingChange'];
  onDefaultVoiceNameChange: RuntimeStatusSidebarProps['onDefaultVoiceNameChange'];
};

export function DefaultSettingsPanel(props: Props) {
  const { t } = useModTranslation('local-chat');
  const {
    open,
    onToggle,
    defaultSettings,
    speechVoices,
    onDefaultSettingChange,
    onDefaultVoiceNameChange,
  } = props;

  return (
    <div className="rounded-[10px] border border-gray-200 bg-gray-50 p-3 text-xs">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-left text-gray-700 font-medium"
      >
        <span>{t('DefaultSettings.title')}</span>
        <span>{open ? '-' : '+'}</span>
      </button>
      {open ? (
        <div className="mt-3 space-y-3">
          <label className="flex items-center justify-between gap-3">
            <span className="text-gray-700">{t('DefaultSettings.enableVoice')}</span>
            <input
              type="checkbox"
              checked={defaultSettings.enableVoice}
              onChange={(event) => onDefaultSettingChange('enableVoice', event.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
            />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span className="text-gray-700">{t('DefaultSettings.allowMultiReply')}</span>
            <input
              type="checkbox"
              checked={defaultSettings.allowMultiReply}
              onChange={(event) => onDefaultSettingChange('allowMultiReply', event.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
            />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span className="text-gray-700">{t('DefaultSettings.allowProactiveContact')}</span>
            <input
              type="checkbox"
              checked={defaultSettings.allowProactiveContact}
              onChange={(event) => onDefaultSettingChange('allowProactiveContact', event.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
            />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span className="text-gray-700">{t('DefaultSettings.autoPlayVoiceReplies')}</span>
            <input
              type="checkbox"
              checked={defaultSettings.autoPlayVoiceReplies}
              onChange={(event) => onDefaultSettingChange('autoPlayVoiceReplies', event.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
            />
          </label>
          <div className="space-y-1">
            <p className="text-gray-700">{t('DefaultSettings.voiceTimbre')}</p>
            <select
              value={defaultSettings.voiceName}
              disabled={!defaultSettings.enableVoice}
              onChange={(event) => onDefaultVoiceNameChange(event.target.value)}
              className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-900 disabled:bg-gray-100 disabled:text-gray-400"
            >
              {Array.from(new Set([
                ...(LOCAL_CHAT_TTS_VOICE_OPTIONS as readonly string[]),
                ...speechVoices.map((voice) => voice.id),
                defaultSettings.voiceName,
              ].filter(Boolean))).map((voice) => (
                <option key={`voice-name-${voice}`} value={voice}>{voice}</option>
              ))}
            </select>
          </div>
        </div>
      ) : null}
    </div>
  );
}
