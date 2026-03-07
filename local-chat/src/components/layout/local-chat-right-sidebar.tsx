import React, { useEffect, useState } from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import { RuntimeStatusSidebar } from '../runtime-status-sidebar.js';
import type { VoiceContextMenu } from './types.js';

type LocalChatRightSidebarProps = {
  isRuntimeSidebarOpen: boolean;
  runtimeSidebarProps: React.ComponentProps<typeof RuntimeStatusSidebar>;
  voiceContextMenu: VoiceContextMenu | null;
  voiceTranscriptVisibleById: Record<string, boolean>;
  onToggleVoiceTranscript: (messageId: string) => void;
};

const RUNTIME_SIDEBAR_WIDTH_PX = 320;
const RUNTIME_SIDEBAR_PREWARM_DELAY_MS = 700;

export function LocalChatRightSidebar({
  isRuntimeSidebarOpen,
  runtimeSidebarProps,
  voiceContextMenu,
  voiceTranscriptVisibleById,
  onToggleVoiceTranscript,
}: LocalChatRightSidebarProps) {
  const { t } = useModTranslation('local-chat');
  const [shouldRenderSidebar, setShouldRenderSidebar] = useState(isRuntimeSidebarOpen);

  useEffect(() => {
    if (isRuntimeSidebarOpen) {
      setShouldRenderSidebar(true);
      return;
    }
    if (shouldRenderSidebar) {
      return;
    }
    const prewarmTimer = setTimeout(() => {
      setShouldRenderSidebar(true);
    }, RUNTIME_SIDEBAR_PREWARM_DELAY_MS);
    return () => {
      clearTimeout(prewarmTimer);
    };
  }, [isRuntimeSidebarOpen, shouldRenderSidebar]);

  return (
    <>
      <div
        className="h-full shrink-0 overflow-hidden transition-[width,opacity,transform] duration-300 ease-[cubic-bezier(0.2,0.7,0.2,1)]"
        style={{
          width: isRuntimeSidebarOpen ? `${RUNTIME_SIDEBAR_WIDTH_PX}px` : '0px',
          opacity: isRuntimeSidebarOpen ? 1 : 0,
          transform: isRuntimeSidebarOpen ? 'translateX(0)' : 'translateX(18px)',
          pointerEvents: isRuntimeSidebarOpen ? 'auto' : 'none',
          willChange: 'width, opacity, transform',
        }}
        aria-hidden={!isRuntimeSidebarOpen}
      >
        <div className="h-full" style={{ width: `${RUNTIME_SIDEBAR_WIDTH_PX}px` }}>
          {shouldRenderSidebar ? (
            <div className={`h-full transition-opacity duration-300 ${isRuntimeSidebarOpen ? 'opacity-100 delay-75' : 'opacity-0'}`}>
              <RuntimeStatusSidebar {...runtimeSidebarProps} />
            </div>
          ) : (
            <div className="lc-sidebar-skeleton flex h-full flex-col p-4">
              <div className="lc-skeleton-bar h-12 w-40 rounded-2xl" />
              <div className="mt-4 lc-skeleton-card h-40 w-full" />
              <div className="mt-4 lc-skeleton-card h-16 w-full" />
              <div className="mt-4 lc-skeleton-card h-72 w-full" />
            </div>
          )}
        </div>
      </div>
      {voiceContextMenu ? (
        <div
          className="fixed z-50 min-w-[160px] rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl"
          style={{ left: `${voiceContextMenu.x}px`, top: `${voiceContextMenu.y}px`, animation: 'panel-scale-in 0.15s ease-out both' }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="w-full rounded-lg px-3 py-2 text-left text-sm text-gray-800 transition-colors hover:bg-gray-100"
            onClick={() => onToggleVoiceTranscript(voiceContextMenu.messageId)}
          >
            {voiceTranscriptVisibleById[voiceContextMenu.messageId]
              ? t('RightSidebar.collapseTranscript')
              : t('RightSidebar.transcribeVoice')}
          </button>
        </div>
      ) : null}
    </>
  );
}
