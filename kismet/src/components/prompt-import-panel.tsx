import { useState } from 'react';
import { useTranslation } from 'react-i18next';

type PromptImportPanelProps = {
  systemPrompt: string;
  userPrompt: string;
  onCopyAll: () => void;
  onImport: (rawText: string) => void;
  loading?: boolean;
};

export function PromptImportPanel({ systemPrompt, userPrompt, onCopyAll, onImport, loading }: PromptImportPanelProps) {
  const { t } = useTranslation('kismet');
  const [importText, setImportText] = useState('');
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    onCopyAll();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">{t('PromptImportPanel.title')}</h3>
          <button
            onClick={handleCopy}
            className="rounded-md bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-200"
          >
            {copied ? t('PromptImportPanel.copied') : t('PromptImportPanel.copyAll')}
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <div className="mb-1 text-xs font-medium text-gray-500">{t('PromptImportPanel.systemPromptLabel')}</div>
            <pre className="max-h-48 overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
              {systemPrompt}
            </pre>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-gray-500">{t('PromptImportPanel.userPromptLabel')}</div>
            <pre className="max-h-32 overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
              {userPrompt}
            </pre>
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-800">{t('PromptImportPanel.importTitle')}</h3>
        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder={t('PromptImportPanel.importPlaceholder')}
          className="h-40 w-full rounded-lg border border-gray-300 px-3 py-2 text-xs font-mono focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          disabled={loading}
        />
        <button
          onClick={() => onImport(importText)}
          disabled={!importText.trim() || loading}
          className="mt-2 w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? t('PromptImportPanel.importing') : t('PromptImportPanel.importButton')}
        </button>
      </div>
    </div>
  );
}
