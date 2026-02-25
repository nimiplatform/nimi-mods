import { useTranslation } from 'react-i18next';
import type { KismetError } from '../types.js';

type ErrorPanelProps = {
  error: KismetError;
  onRetry?: () => void;
  onSwitchMode?: () => void;
};

export function ErrorPanel({ error, onRetry, onSwitchMode }: ErrorPanelProps) {
  const { t } = useTranslation('kismet');

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4">
      <h3 className="mb-2 text-sm font-semibold text-red-800">
        {t('ErrorPanel.title')}
      </h3>
      <div className="space-y-2 text-sm text-red-700">
        <div>
          <span className="font-medium">{t('ErrorPanel.reasonCode')}: </span>
          <code className="rounded bg-red-100 px-1 py-0.5 text-xs">{error.reasonCode}</code>
        </div>
        <p>{error.message}</p>
        <div>
          <span className="font-medium">{t('ErrorPanel.hint')}: </span>
          {error.actionHint}
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        {onRetry && (
          <button
            onClick={onRetry}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
          >
            {t('ErrorPanel.retry')}
          </button>
        )}
        {onSwitchMode && (
          <button
            onClick={onSwitchMode}
            className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
          >
            {t('ErrorPanel.switchMode')}
          </button>
        )}
      </div>
    </div>
  );
}
