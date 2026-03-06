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
  onMediaPlannerModeChange: RuntimeStatusSidebarProps['onMediaPlannerModeChange'];
  onVideoAutoPolicyChange: RuntimeStatusSidebarProps['onVideoAutoPolicyChange'];
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
    onMediaPlannerModeChange,
    onVideoAutoPolicyChange,
  } = props;

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
      {open ? (
        <div className="mt-3">
          <div className="min-h-0 space-y-3 lc-panel-expand">
            <section className="space-y-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                  {t('DefaultSettings.conversationSection')}
                </p>
                <p className="mt-0.5 text-[11px] text-gray-500">
                  {t('DefaultSettings.conversationSectionHint')}
                </p>
              </div>
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
            </section>

            <section className="space-y-2 border-t border-gray-100 pt-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                  {t('DefaultSettings.voiceSection')}
                </p>
                <p className="mt-0.5 text-[11px] text-gray-500">
                  {t('DefaultSettings.voiceSectionHint')}
                </p>
              </div>
              <label className="flex items-center justify-between gap-3">
                <span className="text-gray-700">{t('DefaultSettings.enableVoice')}</span>
                <input
                  type="checkbox"
                  checked={defaultSettings.enableVoice}
                  onChange={(event) => onDefaultSettingChange('enableVoice', event.target.checked)}
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
                  {Array.from(new Set([
                    ...(LOCAL_CHAT_TTS_VOICE_OPTIONS as readonly string[]),
                    ...speechVoices.map((voice) => voice.id),
                    defaultSettings.voiceName,
                  ].filter(Boolean))).map((voice) => (
                    <option key={`voice-name-${voice}`} value={voice}>{voice}</option>
                  ))}
                </select>
              </div>
              <label className="flex items-center justify-between gap-3">
                <span className="text-gray-700">{t('DefaultSettings.autoPlayVoiceReplies')}</span>
                <input
                  type="checkbox"
                  checked={defaultSettings.autoPlayVoiceReplies}
                  onChange={(event) => onDefaultSettingChange('autoPlayVoiceReplies', event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-mint-600 focus:ring-mint-500"
                />
              </label>
            </section>

            <section className="space-y-2 border-t border-gray-100 pt-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                  {t('DefaultSettings.mediaSection')}
                </p>
                <p className="mt-0.5 text-[11px] text-gray-500">
                  {t('DefaultSettings.mediaSectionHint')}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-gray-700">{t('DefaultSettings.mediaPlannerMode')}</p>
                <p className="text-[11px] text-gray-500">{t('DefaultSettings.mediaPlannerModeHint')}</p>
                <select
                  value={defaultSettings.mediaPlannerMode}
                  onChange={(event) => onMediaPlannerModeChange(event.target.value as RuntimeStatusSidebarProps['defaultSettings']['mediaPlannerMode'])}
                  className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-900"
                >
                  <option value="off">{t('DefaultSettings.mediaPlannerModeOff')}</option>
                  <option value="explicit-only">{t('DefaultSettings.mediaPlannerModeExplicitOnly')}</option>
                  <option value="high-confidence-auto">{t('DefaultSettings.mediaPlannerModeAuto')}</option>
                </select>
              </div>
              <div className="space-y-1">
                <p className="text-gray-700">{t('DefaultSettings.videoAutoPolicy')}</p>
                <p className="text-[11px] text-gray-500">{t('DefaultSettings.videoAutoPolicyHint')}</p>
                <select
                  value={defaultSettings.videoAutoPolicy}
                  onChange={(event) => onVideoAutoPolicyChange(event.target.value as RuntimeStatusSidebarProps['defaultSettings']['videoAutoPolicy'])}
                  className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-900"
                >
                  <option value="explicit-only">{t('DefaultSettings.videoAutoPolicyExplicitOnly')}</option>
                  <option value="very-high-confidence-auto">{t('DefaultSettings.videoAutoPolicyAuto')}</option>
                </select>
              </div>
              <label className="flex items-center justify-between gap-3">
                <span className="text-gray-700">{t('DefaultSettings.allowNsfwMedia')}</span>
                <input
                  type="checkbox"
                  checked={defaultSettings.allowNsfwMedia}
                  onChange={(event) => onDefaultSettingChange('allowNsfwMedia', event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-mint-600 focus:ring-mint-500"
                />
              </label>
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
