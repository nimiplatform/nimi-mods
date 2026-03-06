import React from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import { WorldStudioVisualStyles } from '../world-studio-visual-styles.js';

type NoAccessPanelProps = {
  reason: string | null;
  error: string | null;
  onRetry: () => void;
};

export function NoAccessPanel(props: NoAccessPanelProps) {
  const { t } = useModTranslation('world-studio');
  return (
    <div className="ui-sync-root h-full overflow-auto p-4">
      <WorldStudioVisualStyles />
      <div className="mx-auto max-w-xl rounded-[24px] border border-amber-200 bg-amber-50/95 p-5 text-sm text-amber-900 shadow-[0_18px_40px_rgba(217,119,6,0.08)]">
        <div className="text-[28px] font-black tracking-tight text-amber-900">{t('noAccess.title')}</div>
        <p className="mt-2 leading-6">{t('noAccess.description')}</p>
        {props.reason ? <p className="mt-3 text-xs text-amber-700">{t('noAccess.reason')}: {props.reason}</p> : null}
        {props.error ? <p className="mt-1 text-xs text-amber-800">{t('noAccess.error')}: {props.error}</p> : null}
        <button
          type="button"
          onClick={props.onRetry}
          className="ui-sync-btn mt-4 rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800"
        >
          {t('noAccess.retry')}
        </button>
      </div>
    </div>
  );
}
