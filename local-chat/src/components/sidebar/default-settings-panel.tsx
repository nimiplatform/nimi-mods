import React from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import type { RuntimeStatusSidebarProps } from './types.js';

type Props = {
  open: boolean;
  onToggle: () => void;
  defaultSettings: RuntimeStatusSidebarProps['defaultSettings'];
  speechVoices: RuntimeStatusSidebarProps['speechVoices'];
  onDefaultSettingChange: RuntimeStatusSidebarProps['onDefaultSettingChange'];
  onDefaultVoiceNameChange: RuntimeStatusSidebarProps['onDefaultVoiceNameChange'];
};

const CHEVRON_ICON = (
  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 7.5L10 12.5L15 7.5" />
  </svg>
);

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
  const voiceOptions = Array.from(new Set([
    ...speechVoices.map((voice) => voice.id),
    defaultSettings.voiceName,
  ].filter(Boolean)));

  return (
    <div className="lc-card rounded-2xl p-3 text-xs">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex h-7 w-full items-center justify-between text-left text-[13px] font-semibold text-gray-700"
      >
        <span>{t('DefaultSettings.title')}</span>
        <span className={`text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>{CHEVRON_ICON}</span>
      </button>
      <div className={`grid overflow-hidden transition-all duration-200 ${open ? 'mt-3 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className={`min-h-0 space-y-3 ${open ? 'lc-panel-expand' : ''}`}>
          <label className="flex items-center justify-between gap-3">
            <span className="text-gray-700">{t('DefaultSettings.enableVoice')}</span>
            <input
              type="checkbox"
              checked={defaultSettings.enableVoice}
              onChange={(event) => onDefaultSettingChange('enableVoice', event.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-mint-600 focus:ring-mint-500"
            />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span className="text-gray-700">{t('DefaultSettings.allowMultiReply')}</span>
            <input
              type="checkbox"
              checked={defaultSettings.allowMultiReply}
              onChange={(event) => onDefaultSettingChange('allowMultiReply', event.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-mint-600 focus:ring-mint-500"
            />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span className="text-gray-700">{t('DefaultSettings.allowProactiveContact')}</span>
            <input
              type="checkbox"
              checked={defaultSettings.allowProactiveContact}
              onChange={(event) => onDefaultSettingChange('allowProactiveContact', event.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-mint-600 focus:ring-mint-500"
            />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span className="text-gray-700">{t('DefaultSettings.autoPlayVoiceReplies')}</span>
            <input
              type="checkbox"
              checked={defaultSettings.autoPlayVoiceReplies}
              onChange={(event) => onDefaultSettingChange('autoPlayVoiceReplies', event.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-mint-600 focus:ring-mint-500"
            />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span className="text-gray-700">{t('DefaultSettings.allowNsfwMedia')}</span>
            <input
              type="checkbox"
              checked={defaultSettings.allowNsfwMedia}
              onChange={(event) => onDefaultSettingChange('allowNsfwMedia', event.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-mint-600 focus:ring-mint-500"
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
              <option value="">Auto</option>
              {voiceOptions.map((voice) => (
                <option key={`voice-name-${voice}`} value={voice}>{voice}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
