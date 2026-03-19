import React, { useRef } from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod';

interface VoiceButtonProps {
  isRecording: boolean;
  onStart: () => void;
  onStop: () => void;
}

export function VoiceButton({ isRecording, onStart, onStop }: VoiceButtonProps) {
  const { t } = useModTranslation('buddy');
  const pointerIdRef = useRef<number | null>(null);

  const stopIfActive = (pointerId?: number) => {
    if (pointerIdRef.current === null) return;
    if (typeof pointerId === 'number' && pointerId !== pointerIdRef.current) return;
    pointerIdRef.current = null;
    if (isRecording) onStop();
  };

  return (
    <button
      type="button"
      title={isRecording ? t('BuddyPage.voiceRelease') : t('BuddyPage.voiceHold')}
      className={`select-none touch-none flex h-10 w-10 items-center justify-center rounded-full transition-all ${
        isRecording
          ? 'bg-rose-500 text-white shadow-lg shadow-rose-200'
          : 'bg-white text-slate-500 shadow-sm hover:bg-slate-100'
      }`}
      onPointerDown={(e) => {
        e.preventDefault();
        pointerIdRef.current = e.pointerId;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        if (!isRecording) onStart();
      }}
      onPointerUp={(e) => {
        e.preventDefault();
        stopIfActive(e.pointerId);
      }}
      onPointerCancel={(e) => {
        e.preventDefault();
        stopIfActive(e.pointerId);
      }}
      onLostPointerCapture={(e) => {
        e.preventDefault();
        stopIfActive(e.pointerId);
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
      </svg>
      <span className="sr-only">
        {isRecording ? t('BuddyPage.voiceRelease') : t('BuddyPage.voiceHold')}
      </span>
    </button>
  );
}
