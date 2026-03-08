// ---------------------------------------------------------------------------
// Chat page — redesigned with collapsible route banner, improved layout
// ---------------------------------------------------------------------------

import React, { useCallback, useMemo, useState } from 'react';
import type { KBPageController } from '../../controllers/use-kb-page-controller.js';
import { ConversationSidebar } from './conversation-sidebar.js';
import { MessageList } from './message-list.js';
import { ChatInput } from './chat-input.js';
import { CitationPanel } from './citation-panel.js';
import { ScopeSelector } from './scope-selector.js';

type ChatPageProps = {
  controller: KBPageController;
};

type RouteDisplay = {
  source: 'auto' | 'local' | 'cloud';
  connectorId: string;
  model: string;
};

function asString(value: unknown): string {
  return String(value || '').trim();
}

function resolveRouteDisplay(input: {
  source: 'auto' | 'local' | 'cloud';
  connectorId: string;
  model: string;
  routeOptions: KBPageController['chatRouteOptions'] | KBPageController['embeddingRouteOptions'];
}): RouteDisplay {
  const selected = input.routeOptions?.resolvedDefault || input.routeOptions?.selected || null;
  if (input.source === 'auto') {
    return {
      source: 'auto',
      connectorId: asString(selected?.source === 'cloud' ? selected.connectorId : ''),
      model: asString(selected?.model),
    };
  }
  if (input.source === 'cloud') {
    const selectedConnectorId = asString(selected?.source === 'cloud' ? selected.connectorId : '');
    const connectorId = asString(input.connectorId || selectedConnectorId || input.routeOptions?.connectors[0]?.id);
    const connector = input.routeOptions?.connectors.find((item) => item.id === connectorId) || null;
    const selectedModel = asString(selected?.source === 'cloud' ? selected.model : '');
    const model = asString(input.model || selectedModel || connector?.models[0]);
    return { source: 'cloud', connectorId, model };
  }
  const localModel = asString(
    input.model
      || (selected?.source === 'local' ? selected.model : '')
    || input.routeOptions?.local?.models[0]?.model,
  );
  return {
    source: 'local',
    connectorId: '',
    model: localModel,
  };
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'h-3.5 w-3.5'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function RouteChip({ label, value }: { label: string; value: RouteDisplay }) {
  const sourceLabel = value.source === 'auto' ? 'Auto'
    : value.source === 'cloud' ? 'Cloud'
    : 'Local';
  const modelLabel = value.model || '(auto)';

  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-[11px] text-gray-600">
      <span className="font-medium text-gray-700">{label}:</span>
      {sourceLabel} / {modelLabel}
    </span>
  );
}

function MessageSquareIcon() {
  return (
    <svg className="h-12 w-12 text-gray-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function QuickQuestion({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-xs text-gray-600 transition-colors hover:border-indigo-200 hover:bg-indigo-50"
    >
      {text}
    </button>
  );
}

export function ChatPage(props: ChatPageProps) {
  const { controller } = props;
  const { store, ui, chatActions } = controller;
  const [scopeDocIds, setScopeDocIds] = useState<string[]>([]);
  const [routeBannerOpen, setRouteBannerOpen] = useState(false);

  const handleSelectConversation = useCallback((id: string) => {
    store.openConversation(id);
  }, [store]);

  const handleCreateConversation = useCallback(async () => {
    await chatActions.createConversation();
  }, [chatActions]);

  const handleDeleteConversation = useCallback((id: string) => {
    ui.setConfirmDialog({
      message: 'Delete this conversation and all its messages?',
      onConfirm: () => {
        void chatActions.deleteConversation(id);
        ui.setConfirmDialog(null);
      },
    });
  }, [chatActions, ui]);

  const handleRenameConversation = useCallback((id: string, title: string) => {
    const conv = store.conversations.find((c) => c.id === id);
    if (!conv) return;
    store.updateConversation({ ...conv, title, updatedAt: new Date().toISOString() });
  }, [store]);

  const handleSend = useCallback(async (query: string) => {
    if (store.activeConversation && scopeDocIds.length > 0) {
      store.updateConversation({
        ...store.activeConversation,
        scopeDocumentIds: scopeDocIds,
        updatedAt: new Date().toISOString(),
      });
    }
    await chatActions.sendMessage(query);
  }, [chatActions, store, scopeDocIds]);

  const turns = store.activeConversation?.turns ?? [];
  const citations = turns.flatMap((t) => t.citations);

  const hasReadyDocs = store.documents.some((d) => d.status === 'ready');
  const chatRouteDisplay = useMemo(
    () => resolveRouteDisplay({
      source: store.settings.chatRouteSource,
      connectorId: store.settings.chatConnectorId,
      model: store.settings.chatModel,
      routeOptions: controller.chatRouteOptions,
    }),
    [
      store.settings.chatRouteSource,
      store.settings.chatConnectorId,
      store.settings.chatModel,
      controller.chatRouteOptions,
    ],
  );
  const embeddingRouteDisplay = useMemo(
    () => resolveRouteDisplay({
      source: store.settings.embeddingRouteSource,
      connectorId: store.settings.embeddingConnectorId,
      model: store.settings.embeddingModel,
      routeOptions: controller.embeddingRouteOptions,
    }),
    [
      store.settings.embeddingRouteSource,
      store.settings.embeddingConnectorId,
      store.settings.embeddingModel,
      controller.embeddingRouteOptions,
    ],
  );

  return (
    <div className="flex h-full min-h-0">
      {/* Sidebar */}
      <ConversationSidebar
        conversations={store.conversations}
        activeId={store.activeConversationId}
        onSelect={handleSelectConversation}
        onCreate={handleCreateConversation}
        onDelete={handleDeleteConversation}
        onRename={handleRenameConversation}
      />

      {/* Main chat area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Collapsible route banner */}
        <div className="border-b border-gray-100 bg-white">
          <button
            type="button"
            onClick={() => setRouteBannerOpen(!routeBannerOpen)}
            className="flex w-full items-center justify-between px-5 py-2 text-[11px] text-gray-500 hover:bg-gray-50"
          >
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-600">Runtime Route</span>
              <RouteChip label="Chat" value={chatRouteDisplay} />
              <RouteChip label="Embed" value={embeddingRouteDisplay} />
            </div>
            <ChevronDownIcon className={`h-3.5 w-3.5 text-gray-400 transition-transform ${routeBannerOpen ? 'rotate-180' : ''}`} />
          </button>
          {routeBannerOpen && (
            <div className="border-t border-gray-100 bg-gray-50 px-5 py-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-gray-200 bg-white p-3">
                  <p className="text-[11px] font-medium text-gray-700">Chat Route</p>
                  <p className="mt-1 text-[11px] text-gray-500">Source: {chatRouteDisplay.source}</p>
                  {chatRouteDisplay.connectorId && <p className="text-[11px] text-gray-500">Connector: {chatRouteDisplay.connectorId}</p>}
                  <p className="text-[11px] text-gray-500">Model: {chatRouteDisplay.model || '(auto)'}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-3">
                  <p className="text-[11px] font-medium text-gray-700">Embedding Route</p>
                  <p className="mt-1 text-[11px] text-gray-500">Source: {embeddingRouteDisplay.source}</p>
                  {embeddingRouteDisplay.connectorId && <p className="text-[11px] text-gray-500">Connector: {embeddingRouteDisplay.connectorId}</p>}
                  <p className="text-[11px] text-gray-500">Model: {embeddingRouteDisplay.model || '(auto)'}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { void controller.refreshRouteOptions(); }}
                className="mt-2 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50"
              >
                Refresh
              </button>
            </div>
          )}
        </div>

        {!hasReadyDocs ? (
          <div className="flex h-full flex-col items-center justify-center">
            <svg className="h-14 w-14 text-gray-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <p className="mt-3 text-sm font-medium text-gray-500">No documents ready</p>
            <p className="mt-1 text-xs text-gray-400">Import and process documents first to start chatting</p>
          </div>
        ) : !store.activeConversation ? (
          <div className="flex h-full flex-col">
            <div className="flex flex-1 flex-col items-center justify-center gap-4">
              <MessageSquareIcon />
              <div className="text-center">
                <p className="text-sm font-medium text-gray-600">Start a conversation</p>
                <p className="mt-1 text-xs text-gray-400">Ask questions about your imported documents</p>
              </div>
              <div className="mt-2 flex flex-col gap-2">
                <QuickQuestion text="Summarize the main topics across all documents" onClick={() => handleSend('Summarize the main topics across all documents')} />
                <QuickQuestion text="What are the key concepts mentioned?" onClick={() => handleSend('What are the key concepts mentioned?')} />
              </div>
            </div>
            <ChatInput onSend={handleSend} disabled={false} />
          </div>
        ) : (
          <>
            <ScopeSelector
              documents={store.documents}
              selectedDocIds={scopeDocIds}
              onChange={setScopeDocIds}
            />
            <MessageList
              turns={turns}
              onCitationClick={(chunkId) => ui.setCitationPanelChunkId(chunkId)}
              isSending={ui.isSending}
              streamingText={ui.streamingText}
            />
            <CitationPanel
              citations={citations}
              activeCitationChunkId={ui.citationPanelChunkId}
              onClose={() => ui.setCitationPanelChunkId(null)}
            />
            <ChatInput onSend={handleSend} disabled={ui.isSending} />
          </>
        )}
      </div>
    </div>
  );
}
