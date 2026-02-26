import React from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';

type NoAccessPanelProps = {
  reason: string | null;
  error: string | null;
  onRetry: () => void;
};

export function NoAccessPanel(props: NoAccessPanelProps) {
  const { t } = useModTranslation('world-studio');
  return (
    <div className="m-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <div className="text-base font-semibold">{t('noAccess.title')}</div>
      <p className="mt-2">{t('noAccess.description')}</p>
      {props.reason ? <p className="mt-2 text-xs text-amber-700">{t('noAccess.reason')}: {props.reason}</p> : null}
      {props.error ? <p className="mt-1 text-xs text-amber-800">{t('noAccess.error')}: {props.error}</p> : null}
      <button
        type="button"
        onClick={props.onRetry}
        className="mt-3 rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800"
      >
        {t('noAccess.retry')}
      </button>
    </div>
  );
}
