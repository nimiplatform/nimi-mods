import { useTranslation } from 'react-i18next';
import type { RouteSourceDisplay } from '../types.js';

type RouteStatusBadgeProps = {
  source: RouteSourceDisplay;
};

export function RouteStatusBadge({ source }: RouteStatusBadgeProps) {
  const { t } = useTranslation('kismet');

  const colorMap: Record<RouteSourceDisplay, string> = {
    'local-runtime': 'bg-green-100 text-green-800 border-green-200',
    'token-api': 'bg-blue-100 text-blue-800 border-blue-200',
    unavailable: 'bg-gray-100 text-gray-500 border-gray-200',
  };

  const labelMap: Record<RouteSourceDisplay, string> = {
    'local-runtime': t('RouteStatus.localRuntime'),
    'token-api': t('RouteStatus.tokenApi'),
    unavailable: t('RouteStatus.unavailable'),
  };

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${colorMap[source]}`}>
      <span className="text-[10px]">{t('RouteStatus.routeSource')}:</span>
      {labelMap[source]}
    </span>
  );
}
