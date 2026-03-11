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
  onCloseSidebar: () => void;
};

type SidebarBoundaryProps = {
  children: React.ReactNode;
  resetKey: string;
  title: string;
  body: string;
  closeLabel: string;
  onClose: () => void;
};

type SidebarBoundaryState = {
  error: Error | null;
};

const RUNTIME_SIDEBAR_WIDTH_PX = 320;
const RUNTIME_SIDEBAR_PREWARM_DELAY_MS = 700;

class RuntimeSidebarBoundary extends React.Component<SidebarBoundaryProps, SidebarBoundaryState> {
  override state: SidebarBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): SidebarBoundaryState {
    return { error };
  }

  override componentDidUpdate(prevProps: SidebarBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  override render() {
    if (!this.state.error) {
      return this.props.children;
    }
    return (
      <div className="flex h-full flex-col justify-between border-l border-[var(--lc-border)] bg-[#f7fafb] p-4">
        <div className="rounded-[24px] border border-rose-200 bg-white px-4 py-4 shadow-[0_14px_28px_rgba(15,23,42,0.08)]">
          <p className="text-base font-semibold text-rose-700">{this.props.title}</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">{this.props.body}</p>
          <p className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            {String(this.state.error.message || this.state.error.name || 'runtime sidebar error')}
          </p>
        </div>
        <button
          type="button"
          onClick={this.props.onClose}
          className="lc-btn lc-btn-secondary h-10 rounded-full px-4 text-sm font-semibold"
        >
          {this.props.closeLabel}
        </button>
      </div>
    );
  }
}

export function LocalChatRightSidebar({
  isRuntimeSidebarOpen,
  runtimeSidebarProps,
  voiceContextMenu,
  voiceTranscriptVisibleById,
  onToggleVoiceTranscript,
  onCloseSidebar,
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
              <RuntimeSidebarBoundary
                resetKey={isRuntimeSidebarOpen ? 'open' : 'closed'}
                title={t('RightSidebar.inspectCrashedTitle')}
                body={t('RightSidebar.inspectCrashedBody')}
                closeLabel={t('RightSidebar.closeInspect')}
                onClose={onCloseSidebar}
              >
                <RuntimeStatusSidebar {...runtimeSidebarProps} sidebarVisible={isRuntimeSidebarOpen} />
              </RuntimeSidebarBoundary>
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
