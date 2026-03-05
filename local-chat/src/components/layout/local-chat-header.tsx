import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode, type RefObject } from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import { SessionMenu } from '../session-menu.js';
import type { LocalChatSession } from '../../state/index.js';
import type { LocalChatTargetItem } from './types.js';

type LocalChatHeaderProps = {
  selectedTarget: LocalChatTargetItem | null;
  selectedTargetAvatarUrl: string | null;
  selectedTargetInitial: string;
  onOpenSelectedTargetProfile: () => void;
  selectedTargetId: string;
  sessions: LocalChatSession[];
  selectedSessionId: string | null;
  onCreateSession: () => void;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  isSessionMenuOpen: boolean;
  setIsSessionMenuOpen: (updater: boolean | ((previous: boolean) => boolean)) => void;
  sessionMenuAnchorRef: RefObject<HTMLDivElement | null>;
  sessionMenuPanelRef: RefObject<HTMLDivElement | null>;
  isRuntimeSidebarOpen: boolean;
  setIsRuntimeSidebarOpen: (updater: (previous: boolean) => boolean) => void;
  chevronIcon: ReactNode;
  sidebarHideIcon: ReactNode;
  sidebarShowIcon: ReactNode;
};

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as Record<string, unknown>;
}

export function LocalChatHeader({
  selectedTarget,
  selectedTargetAvatarUrl,
  selectedTargetInitial,
  onOpenSelectedTargetProfile,
  selectedTargetId,
  sessions,
  selectedSessionId,
  onCreateSession,
  onSelectSession,
  onDeleteSession,
  isSessionMenuOpen,
  setIsSessionMenuOpen,
  sessionMenuAnchorRef,
  sessionMenuPanelRef,
  isRuntimeSidebarOpen,
  setIsRuntimeSidebarOpen,
  chevronIcon,
  sidebarHideIcon,
  sidebarShowIcon,
}: LocalChatHeaderProps) {
  const { t } = useModTranslation('local-chat');
  const [agentIntroOpen, setAgentIntroOpen] = useState(false);
  const avatarButtonRef = useRef<HTMLButtonElement>(null);
  const introPanelRef = useRef<HTMLDivElement>(null);

  const agentIntro = useMemo(() => {
    if (!selectedTarget) {
      return {
        persona: '',
        bio: '',
        worldName: '',
      };
    }
    const world = toRecord(selectedTarget.world);
    const worldview = toRecord(selectedTarget.worldview);
    const agentProfile = toRecord(selectedTarget.agentProfile);
    const agentMetadata = toRecord(selectedTarget.agentMetadata);
    const dna = toRecord(agentProfile?.dna);

    const bio = readString(selectedTarget.bio);
    const persona = readString(dna?.persona)
      || readString(agentProfile?.persona)
      || readString(agentProfile?.summary)
      || readString(agentMetadata?.persona);
    const worldName = readString(world?.name)
      || readString(world?.title)
      || readString(worldview?.name)
      || readString(selectedTarget.worldId);

    return {
      persona,
      bio,
      worldName,
    };
  }, [selectedTarget]);

  useEffect(() => {
    setAgentIntroOpen(false);
  }, [selectedTarget?.id]);

  useEffect(() => {
    if (!agentIntroOpen) {
      return;
    }
    const onMouseDown = (event: globalThis.MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }
      if (avatarButtonRef.current?.contains(target)) {
        return;
      }
      if (introPanelRef.current?.contains(target)) {
        return;
      }
      setAgentIntroOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAgentIntroOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [agentIntroOpen]);

  const canShowAgentIntro = Boolean(selectedTarget);
  const agentIntroLabel = t('Header.viewAgentIntro');

  return (
    <div className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 bg-gradient-to-r from-mint-50 to-white px-4">
      <div className="relative flex min-w-0 items-center gap-3">
        <button
          ref={avatarButtonRef}
          type="button"
          onClick={() => {
            if (!canShowAgentIntro) {
              return;
            }
            setAgentIntroOpen((previous) => !previous);
          }}
          disabled={!canShowAgentIntro}
          aria-label={agentIntroLabel}
          title={canShowAgentIntro ? agentIntroLabel : undefined}
          className={`shrink-0 rounded-full ${canShowAgentIntro ? 'transition hover:opacity-90' : ''}`}
        >
          {selectedTargetAvatarUrl ? (
            <img
              src={selectedTargetAvatarUrl}
              alt={selectedTarget?.displayName || 'Agent'}
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-mint-500 to-mint-700 text-xs font-bold text-white">
              {selectedTargetInitial}
            </div>
          )}
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold text-gray-900">
            {selectedTarget?.displayName || t('Header.title')}
          </h1>
          <p className="truncate text-xs text-gray-500">
            {selectedTarget?.handle || t('Header.subtitle')}
          </p>
        </div>
        {agentIntroOpen && selectedTarget ? (
          <div
            ref={introPanelRef}
            className="absolute left-0 top-[calc(100%+8px)] z-40 w-[320px] rounded-xl border border-gray-200 bg-white p-3 shadow-lg"
            style={{ animation: 'panel-scale-in 0.15s ease-out both' }}
            onClick={(event: ReactMouseEvent<HTMLDivElement>) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">{selectedTarget.displayName}</p>
                <p className="truncate text-xs text-gray-500">{selectedTarget.handle}</p>
              </div>
              <button
                type="button"
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label={t('Header.closeIntro')}
                onClick={() => setAgentIntroOpen(false)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                selectedTarget.isAgent ? 'border-brand-200 bg-brand-100 text-brand-700' : 'border-gray-200 bg-gray-100 text-gray-600'
              }`}>
                {selectedTarget.isAgent ? 'Agent' : 'User'}
              </span>
              {agentIntro.worldName ? (
                <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                  {t('Header.worldPrefix')}{agentIntro.worldName}
                </span>
              ) : null}
            </div>

            <p className="mt-3 text-xs leading-5 text-gray-700">
              {agentIntro.bio || t('Header.noBio')}
            </p>

            {agentIntro.persona ? (
              <p className="mt-2 rounded-md bg-gray-50 px-2 py-1.5 text-xs text-gray-600">
                {t('Header.persona')}{agentIntro.persona}
              </p>
            ) : null}

            <button
              type="button"
              className="mt-3 w-full rounded-lg bg-brand-500 px-3 py-2 text-xs font-medium text-white hover:bg-brand-600"
              onClick={() => {
                onOpenSelectedTargetProfile();
                setAgentIntroOpen(false);
              }}
            >
              {t('Header.goToProfile')}
            </button>
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <SessionMenu
          selectedTargetId={selectedTargetId}
          isOpen={isSessionMenuOpen}
          setIsOpen={setIsSessionMenuOpen}
          sessions={sessions}
          selectedSessionId={selectedSessionId || ''}
          anchorRef={sessionMenuAnchorRef}
          panelRef={sessionMenuPanelRef}
          onCreateSession={onCreateSession}
          onSelectSession={onSelectSession}
          onDeleteSession={onDeleteSession}
          chevronIcon={chevronIcon}
        />
        <button
          type="button"
          onClick={() => setIsRuntimeSidebarOpen((previous) => !previous)}
          title={isRuntimeSidebarOpen ? t('Header.hideRuntime') : t('Header.showRuntime')}
          aria-label={isRuntimeSidebarOpen ? t('Header.hideRuntime') : t('Header.showRuntime')}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
        >
          {isRuntimeSidebarOpen ? sidebarHideIcon : sidebarShowIcon}
        </button>
      </div>
    </div>
  );
}
