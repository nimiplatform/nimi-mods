import React from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import type { LocalChatSession } from '../state/index.js';

type SessionMenuProps = {
  selectedTargetId: string;
  isOpen: boolean;
  setIsOpen: (updater: boolean | ((previous: boolean) => boolean)) => void;
  sessions: LocalChatSession[];
  selectedSessionId: string;
  anchorRef: React.RefObject<HTMLDivElement | null>;
  panelRef: React.RefObject<HTMLDivElement | null>;
  onCreateSession: () => void;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  chevronIcon: React.ReactNode;
};

export function SessionMenu(props: SessionMenuProps) {
  const { t } = useModTranslation('local-chat');
  return (
    <div ref={props.anchorRef} className="relative">
      <button
        type="button"
        disabled={!props.selectedTargetId}
        onClick={() => props.setIsOpen((previous) => !previous)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {t('SessionMenu.title')}
        <span className={`transition-transform ${props.isOpen ? 'rotate-180' : ''}`}>
          {props.chevronIcon}
        </span>
      </button>
      {props.isOpen ? (
        <div
          ref={props.panelRef}
          className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
            <p className="text-xs font-semibold text-gray-700">{t('SessionMenu.title')}</p>
            <button
              type="button"
              onClick={props.onCreateSession}
              disabled={!props.selectedTargetId}
              className="h-7 rounded-md border border-gray-200 bg-white px-2 text-[11px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              {t('SessionMenu.newSession')}
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {props.sessions.length === 0 ? (
              <p className="px-3 py-3 text-[11px] text-gray-500">{t('SessionMenu.noSessions')}</p>
            ) : (
              props.sessions.map((session) => {
                const active = session.id === props.selectedSessionId;
                const updatedLabel = new Date(session.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                return (
                  <div
                    key={session.id}
                    className={`border-b border-gray-100 px-3 py-2 ${active ? 'bg-green-50' : ''}`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        props.onSelectSession(session.id);
                        props.setIsOpen(false);
                      }}
                      className="w-full text-left"
                    >
                      <p className="truncate text-xs font-medium text-gray-900">{session.title}</p>
                      <p className="mt-1 text-[11px] text-gray-500">
                        {t('SessionMenu.turns', { count: session.turns.length })} · {updatedLabel}
                      </p>
                    </button>
                    <div className="mt-1 flex justify-end">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          props.onDeleteSession(session.id);
                        }}
                        className="text-[11px] text-gray-500 hover:text-red-600"
                      >
                        {t('SessionMenu.delete')}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
