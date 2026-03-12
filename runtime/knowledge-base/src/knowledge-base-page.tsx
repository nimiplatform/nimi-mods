// ---------------------------------------------------------------------------
// Knowledge Base page — top-level entry rendered inside the mod tab
// Documents / Chat / Settings view routing (SSOT §8)
// ---------------------------------------------------------------------------
import React from 'react';
import { useKBPageController } from './controllers/use-kb-page-controller.js';
import { KBShell } from './components/shared/kb-shell.js';
import { KBNavTabs } from './components/shared/kb-nav-tabs.js';
import { DocumentListPage } from './components/documents/document-list-page.js';
import { ChatPage } from './components/chat/chat-page.js';
import { SettingsPage } from './components/settings/settings-page.js';
import { useModTranslation } from "@nimiplatform/sdk/mod";
export function KnowledgeBasePage() {
    const { t } = useModTranslation('knowledge-base');
    const controller = useKBPageController();
    const { store, ui } = controller;
    if (!store.initialized) {
        return (<div data-nimi-mod-root="knowledge-base" className="flex h-full items-center justify-center bg-gray-50">
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border border-indigo-400 border-t-transparent"/>
          <p className="text-xs text-gray-400">{t('nav.pageLoading')}</p>
        </div>
      </div>);
    }
    const header = (<div className="border-b border-gray-200 bg-white">
      <KBNavTabs activeTab={store.activeTab} onTabChange={store.setActiveTab} documentCount={store.documents.length} conversationCount={store.conversations.length}/>
    </div>);
    let content: React.ReactNode;
    switch (store.activeTab) {
        case 'documents':
            content = (<DocumentListPage documents={store.documents} importDialogOpen={ui.importDialogOpen} isImporting={ui.isImporting} onOpenImportDialog={() => ui.setImportDialogOpen(true)} onCloseImportDialog={() => ui.setImportDialogOpen(false)} onImportFile={controller.documentActions.importFile} onImportText={controller.documentActions.importText} onImportUrl={controller.documentActions.importUrl} onDelete={(docId) => {
                    ui.setConfirmDialog({
                        message: t('documents.confirmDeleteMessage'),
                        onConfirm: () => {
                            controller.documentActions.deleteDocument(docId);
                            ui.setConfirmDialog(null);
                        },
                    });
                }} onRetry={controller.documentActions.retryDocument}/>);
            break;
        case 'chat':
            content = <ChatPage controller={controller}/>;
            break;
        case 'settings':
            content = (<SettingsPage settings={store.settings} onUpdate={(patch) => store.updateSettings(patch)} chatRouteOptions={controller.chatRouteOptions} embeddingRouteOptions={controller.embeddingRouteOptions} onRefreshRouteOptions={() => { void controller.refreshRouteOptions(); }}/>);
            break;
    }
    return (<div data-nimi-mod-root="knowledge-base" className="h-full min-h-0">
      <KBShell header={header} content={content} error={ui.error} onDismissError={ui.clearError} confirmDialog={ui.confirmDialog} onDismissConfirm={() => ui.setConfirmDialog(null)}/>
    </div>);
}
