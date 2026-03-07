import { useState } from 'react';
import type { KismetAiRawResponse } from '../types.js';
import { useTranslation } from 'react-i18next';

type AiRawOutputPanelProps = {
  response: KismetAiRawResponse;
};

export function AiRawOutputPanel({ response }: AiRawOutputPanelProps) {
  const { t } = useTranslation('kismet');
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(response.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-amber-900">{t('AiRawOutput.title')}</h3>
          <div className="mt-1 text-xs text-amber-700">
            {t('AiRawOutput.routeSource')}: {response.routeSource}
            {response.traceId ? ` · ${t('AiRawOutput.traceId')}: ${response.traceId}` : ''}
            {` · ${t('AiRawOutput.length')}: ${response.length}`}
          </div>
          <div className="mt-1 text-xs text-amber-700">
            {response.resolvedProvider ? `${t('AiRawOutput.provider')}: ${response.resolvedProvider}` : ''}
            {response.resolvedModel ? ` · ${t('AiRawOutput.model')}: ${response.resolvedModel}` : ''}
            {response.resolvedConnectorId ? ` · ${t('AiRawOutput.connectorId')}: ${response.resolvedConnectorId}` : ''}
          </div>
        </div>
        <button
          type="button"
          onClick={() => { void handleCopy(); }}
          className="rounded-md bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-200"
        >
          {copied ? t('AiRawOutput.copied') : t('AiRawOutput.copy')}
        </button>
      </div>
      <pre className="max-h-[360px] overflow-auto rounded-xl border border-amber-200 bg-white p-3 text-xs leading-6 text-gray-800 whitespace-pre-wrap break-words">
        {response.text}
      </pre>
      <div className="mt-3 space-y-2">
        <div className="text-xs text-amber-800">
          {t('AiRawOutput.firstChar')}: <code className="rounded bg-amber-100 px-1 py-0.5">{response.firstChar || '(empty)'}</code>
          {' · '}
          {t('AiRawOutput.lastChar')}: <code className="rounded bg-amber-100 px-1 py-0.5">{response.lastChar || '(empty)'}</code>
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-amber-800">{t('AiRawOutput.escapedText')}</div>
          <pre className="max-h-[180px] overflow-auto rounded-xl border border-amber-200 bg-white p-3 text-xs leading-6 text-gray-700 whitespace-pre-wrap break-words">
            {response.escapedText}
          </pre>
        </div>
      </div>
    </div>
  );
}
