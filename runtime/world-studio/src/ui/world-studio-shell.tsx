import React from 'react';
import { WorldStudioVisualStyles } from './world-studio-visual-styles.js';

type WorldStudioShellProps = {
  title: string;
  subtitle: string;
  leftPanel: React.ReactNode;
  mainPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  headerActions?: React.ReactNode;
  hideLeftPanel?: boolean;
};

export function WorldStudioShell(props: WorldStudioShellProps) {
  return (
    <div className="ui-sync-root flex h-full min-h-0 flex-col overflow-hidden" data-ui-version="v3">
      <WorldStudioVisualStyles />
      <header className="ui-sync-shell-header flex h-16 shrink-0 items-center justify-between border-b border-gray-200 px-5">
        <div className="min-w-0">
          <h2 className="ui-sync-shell-title truncate text-gray-900">{props.title}</h2>
          <p className="ui-sync-shell-subtitle mt-1 truncate text-xs">{props.subtitle}</p>
        </div>
        {props.headerActions ? (
          <div className="flex items-center gap-2">
            {props.headerActions}
          </div>
        ) : null}
      </header>
      <div className="flex min-h-0 flex-1">
        {!props.hideLeftPanel ? (
          <aside className="ui-sync-pane ui-sync-pane-side ui-sync-shell-sidebar-left min-h-0 w-80 shrink-0 overflow-hidden border-r border-gray-200">{props.leftPanel}</aside>
        ) : null}
        <main className="ui-sync-pane ui-sync-pane-main ui-sync-shell-main min-h-0 min-w-0 flex-1 overflow-hidden">{props.mainPanel}</main>
        <aside className="ui-sync-pane ui-sync-pane-right ui-sync-shell-sidebar-right min-h-0 w-80 shrink-0 overflow-hidden border-l border-gray-200">{props.rightPanel}</aside>
      </div>
    </div>
  );
}
