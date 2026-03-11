import { useState } from 'react';
import { useTranslation } from 'react-i18next';

type PromptImportPanelProps = {
  title?: string;
  systemPrompt: string;
  userPrompt: string;
  onCopyAll: () => void;
  onImport: (rawText: string) => void;
  loading?: boolean;
};

export function PromptImportPanel({ title, systemPrompt, userPrompt, onCopyAll, onImport, loading }: PromptImportPanelProps) {
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
        <div className="mb-3 flex items-center justify-between">
          <h3 className="ks-serif text-sm" style={{ color: '#8A7254', fontWeight: 600 }}>{title || t('PromptImportPanel.title')}</h3>
          <button
            onClick={handleCopy}
            className="ks-serif text-xs"
            style={{ background: 'rgba(138,114,84,0.1)', border: '1px solid rgba(138,114,84,0.3)', color: '#8A7254', padding: '4px 12px', cursor: 'pointer' }}
          >
            {copied ? t('PromptImportPanel.copied') : t('PromptImportPanel.copyAll')}
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <div className="mb-1 text-xs" style={{ color: '#8C857B' }}>{t('PromptImportPanel.systemPromptLabel')}</div>
            <pre
              className="overflow-auto text-xs"
              style={{ maxHeight: 192, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(138,114,84,0.15)', padding: 12, color: '#8C857B', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
            >
              {systemPrompt}
            </pre>
          </div>
          <div>
            <div className="mb-1 text-xs" style={{ color: '#8C857B' }}>{t('PromptImportPanel.userPromptLabel')}</div>
            <pre
              className="overflow-auto text-xs"
              style={{ maxHeight: 128, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(138,114,84,0.15)', padding: 12, color: '#8C857B', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
            >
              {userPrompt}
            </pre>
          </div>
        </div>
      </div>

      <div>
        <h3 className="ks-serif mb-2 text-sm" style={{ color: '#8A7254', fontWeight: 600 }}>{t('PromptImportPanel.importTitle')}</h3>
        <p className="mb-2 text-xs" style={{ color: '#8C857B' }}>{t('PromptImportPanel.importHint')}</p>
        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder={t('PromptImportPanel.importPlaceholder')}
          className="w-full text-xs"
          style={{
            height: 160,
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(138,114,84,0.3)',
            padding: 12,
            color: '#E8E3D7',
            fontFamily: 'monospace',
            outline: 'none',
            resize: 'vertical',
          }}
          disabled={loading}
        />
        <button
          onClick={() => onImport(importText)}
          disabled={!importText.trim() || loading}
          className="ks-btn-seal mt-2"
          style={{ letterSpacing: '4px' }}
        >
          {loading ? t('PromptImportPanel.importing') : t('PromptImportPanel.importButton')}
        </button>
      </div>
    </div>
  );
}
