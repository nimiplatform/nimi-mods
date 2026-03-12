import React from 'react';
import type { MintYouError } from '../types.js';
import { useModTranslation } from "@nimiplatform/sdk/mod";
type ErrorBannerProps = {
    error: MintYouError;
    onRetry?: () => void;
    onDismiss?: () => void;
};
export function ErrorBanner({ error, onRetry, onDismiss }: ErrorBannerProps) {
    const { t } = useModTranslation('mint-you');
    return (<div className="rounded-lg border border-red-200 bg-red-50 p-3">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-red-500">!</span>
        <div className="flex-1">
          <p className="text-sm font-medium text-red-800">{error.message}</p>
          <p className="mt-1 text-xs text-red-600">{error.actionHint}</p>
          <p className="mt-1 text-xs text-red-400">{t('Errors.codeLabel')}: {error.reasonCode}</p>
        </div>
      </div>
      {(onRetry || onDismiss) && (<div className="mt-2 flex gap-2">
          {onRetry && (<button onClick={onRetry} className="rounded-md bg-red-100 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-200">
              {t('Common.retry')}
            </button>)}
          {onDismiss && (<button onClick={onDismiss} className="rounded-md px-3 py-1 text-xs text-red-600 hover:bg-red-100">
              {t('Common.dismiss')}
            </button>)}
        </div>)}
    </div>);
}
