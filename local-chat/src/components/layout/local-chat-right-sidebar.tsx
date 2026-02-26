import type React from 'react';
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

export function LocalChatRightSidebar({
  isRuntimeSidebarOpen,
  runtimeSidebarProps,
  voiceContextMenu,
  voiceTranscriptVisibleById,
  onToggleVoiceTranscript,
}: LocalChatRightSidebarProps) {
  const { t } = useModTranslation('local-chat');
  return (
    <>
      {isRuntimeSidebarOpen ? (
        <RuntimeStatusSidebar {...runtimeSidebarProps} />
      ) : null}
      {voiceContextMenu ? (
        <div
          className="fixed z-50 min-w-[140px] rounded-lg border border-gray-200 bg-white p-1 shadow-xl"
          style={{ left: `${voiceContextMenu.x}px`, top: `${voiceContextMenu.y}px` }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="w-full rounded-md px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-100"
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
