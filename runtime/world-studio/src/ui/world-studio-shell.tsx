import React from 'react';
import { WorldStudioVisualStyles } from './world-studio-visual-styles.js';
import { worldStudioMessage } from '../i18n/messages.js';

type WorldStudioShellProps = {
  title: string;
  subtitle: string;
  currentObjectLabel: string;
  isDirty: boolean;
  dirtyLabel: string;
  settingsDrawerOpen: boolean;
  onToggleSettingsDrawer: () => void;
  onCloseSettingsDrawer: () => void;
  taskStrip?: React.ReactNode;
  mainPanel: React.ReactNode;
  workflowSidebar: React.ReactNode;
  settingsDrawer: React.ReactNode;
  headerActions?: React.ReactNode;
};

export function WorldStudioShell(props: WorldStudioShellProps) {
  return (
    <div
      className="ui-sync-root relative isolate flex h-full min-h-0 min-w-0 w-full flex-1 overflow-hidden bg-[#eef7f5]"
      data-ui-version="v5"
    >
      <WorldStudioVisualStyles />

      <div className="flex min-h-0 w-full min-w-0 flex-1">
        <aside className="ui-sync-shell-sidebar-left ui-sync-pane ui-sync-pane-side flex min-h-0 w-[280px] shrink-0 flex-col border-r border-white/70 bg-[#f7fbfb]">
          <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-5">
            {props.workflowSidebar}
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <header className="ui-sync-shell-header shrink-0 border-b border-white/70">
            <div className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <h2 className="ui-sync-shell-title truncate text-slate-950">{props.title}</h2>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="truncate">{props.subtitle}</span>
                  <span className="truncate text-slate-400">{props.currentObjectLabel}</span>
                  <span
                    className={`rounded-full border px-2.5 py-1 font-semibold shadow-sm ${
                      props.isDirty
                        ? 'border-amber-200 bg-amber-50/90 text-amber-700'
                        : 'border-emerald-200 bg-emerald-50/90 text-emerald-700'
                    }`}
                  >
                    {props.dirtyLabel}
                  </span>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {props.headerActions}
                <button
                  type="button"
                  className="inline-flex h-9 items-center rounded-2xl border border-white/80 bg-white/92 px-4 text-sm font-semibold text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.06)] backdrop-blur"
                  onClick={props.onToggleSettingsDrawer}
                >
                  {worldStudioMessage('shell.settingsDrawer', '设置')}
                </button>
              </div>
            </div>
          </header>

          {props.taskStrip}

          <main className="ui-sync-shell-main ui-sync-pane ui-sync-pane-main min-h-0 min-w-0 flex-1 overflow-hidden">
            {props.mainPanel}
          </main>
        </div>
      </div>

      <button
        type="button"
        aria-label={worldStudioMessage('shell.closeSettingsOverlay', 'Close settings')}
        className={`absolute inset-0 z-20 bg-slate-900/12 backdrop-blur-[1px] transition-opacity duration-300 ${
          props.settingsDrawerOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        tabIndex={props.settingsDrawerOpen ? 0 : -1}
        onClick={props.onCloseSettingsDrawer}
      />

      <aside
        className={`ui-sync-shell-sidebar-right ui-sync-pane ui-sync-pane-right absolute inset-y-0 right-0 z-30 h-full w-[360px] max-w-[92vw] border-l border-white/70 bg-[#f8fbfb] shadow-[-12px_0_28px_rgba(15,23,42,0.1)] transition-transform duration-300 ease-[cubic-bezier(0.2,0.7,0.2,1)] will-change-transform transform-gpu ${
          props.settingsDrawerOpen ? 'translate-x-0' : 'pointer-events-none translate-x-full'
        }`}
        aria-hidden={!props.settingsDrawerOpen}
      >
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 px-4">
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {worldStudioMessage('shell.settingsDrawerTitle', '设置')}
              </p>
            </div>
            <button
              type="button"
              onClick={props.onCloseSettingsDrawer}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-50"
              aria-label={worldStudioMessage('shell.closeSettings', 'Close settings')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {props.settingsDrawer}
          </div>
        </div>
      </aside>
    </div>
  );
}
