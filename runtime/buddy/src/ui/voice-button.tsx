import React from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';

interface VoiceButtonProps {
  isRecording: boolean;
  onStart: () => void;
  onStop: () => void;
}

export function VoiceButton({ isRecording, onStart, onStop }: VoiceButtonProps) {
  const { t } = useModTranslation('buddy');
  return (
    <button
      type="button"
      className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm transition-all ${
        isRecording
          ? 'bg-red-500 text-white shadow-lg shadow-red-200'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
      onPointerDown={(e) => {
        e.preventDefault();
        if (!isRecording) onStart();
      }}
      onPointerUp={(e) => {
        e.preventDefault();
        if (isRecording) onStop();
      }}
      onPointerLeave={(e) => {
        e.preventDefault();
        if (isRecording) onStop();
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
      </svg>
      {isRecording ? t('BuddyPage.voiceRelease') : t('BuddyPage.voiceHold')}
    </button>
  );
}
