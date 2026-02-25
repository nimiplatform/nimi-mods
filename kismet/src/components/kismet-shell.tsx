import { useTranslation } from 'react-i18next';
import { useKismetStore } from '../state/kismet-store.js';
import { useKismetController } from '../hooks/use-kismet-controller.js';
import { useKismetExport } from '../hooks/use-kismet-export.js';
import { InputForm } from './input-form.js';
import { ModelSelector } from './model-selector.js';
import { PromptImportPanel } from './prompt-import-panel.js';
import { RouteStatusBadge } from './route-status-badge.js';
import { ResultView } from './result-view.js';
import { ExportToolbar } from './export-toolbar.js';
import { ErrorPanel } from './error-panel.js';

export function KismetShell() {
  const { t } = useTranslation('kismet');
  const store = useKismetStore();
  const controller = useKismetController();
  const exportActions = useKismetExport();
  const { route } = controller;

  return (
    <div className="flex h-full min-h-0">
      {/* Left Panel - Input */}
      <div className="w-80 shrink-0 overflow-y-auto border-r border-gray-200 bg-gray-50 p-4">
        <div className="mb-4">
          <h1 className="text-lg font-bold text-gray-900">{t('Page.title')}</h1>
          <p className="text-xs text-gray-500">{t('Page.subtitle')}</p>
        </div>

        <div className="mb-4">
          <RouteStatusBadge source={route.routeSource} />
        </div>

        <div className="mb-4">
          <ModelSelector
            routeOverride={route.routeOverride}
            chatRouteOptions={route.chatRouteOptions}
            onSourceChange={route.handleSourceChange}
            onConnectorChange={route.handleConnectorChange}
            onModelChange={route.handleModelChange}
            onClear={route.clearOverride}
          />
        </div>

        <InputForm onSubmit={controller.submitInput} disabled={store.loading} />
      </div>

      {/* Right Panel - Results */}
      <div className="flex-1 overflow-y-auto p-6">
        {store.error && (
          <div className="mb-4">
            <ErrorPanel
              error={store.error}
              onRetry={controller.submitInput}
              onSwitchMode={() => store.setMode('prompt-import')}
            />
          </div>
        )}

        {/* Hidden fallback: auto-switched to prompt-import when route unavailable */}
        {store.mode === 'prompt-import' && store.generatedPrompts && !store.result && (
          <PromptImportPanel
            systemPrompt={store.generatedPrompts.systemPrompt}
            userPrompt={store.generatedPrompts.userPrompt}
            onCopyAll={controller.copyPrompts}
            onImport={controller.importResult}
            loading={store.loading}
          />
        )}

        {store.result && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <ExportToolbar
                canExport={exportActions.canExport}
                onExportJson={exportActions.handleExportJson}
                onExportPdf={exportActions.handleExportPdf}
                onExportHtml={exportActions.handleExportHtml}
              />
            </div>
            <ResultView result={store.result} />
          </div>
        )}

        {!store.result && !store.generatedPrompts && !store.error && !store.loading && (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            {t('Page.subtitle')}
          </div>
        )}
      </div>
    </div>
  );
}
