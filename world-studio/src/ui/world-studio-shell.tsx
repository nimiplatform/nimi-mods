import React from 'react';

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
    <div className="flex h-full min-h-0 flex-col bg-gray-50">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">{props.title}</h2>
          <p className="text-xs text-gray-500">{props.subtitle}</p>
        </div>
        {props.headerActions ? (
          <div className="flex items-center gap-2">
            {props.headerActions}
          </div>
        ) : null}
      </header>
      <div className="flex min-h-0 flex-1">
        {!props.hideLeftPanel ? (
          <aside className="min-h-0 w-80 shrink-0 overflow-hidden border-r border-gray-200 bg-white">{props.leftPanel}</aside>
        ) : null}
        <main className="min-h-0 min-w-0 flex-1 overflow-hidden">{props.mainPanel}</main>
        <aside className="min-h-0 w-80 shrink-0 overflow-hidden border-l border-gray-200 bg-white">{props.rightPanel}</aside>
      </div>
    </div>
  );
}
