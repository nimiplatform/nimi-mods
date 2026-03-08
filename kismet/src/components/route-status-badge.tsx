import { useTranslation } from 'react-i18next';
import type { RouteSourceDisplay } from '../types.js';

type RouteStatusBadgeProps = {
  source: RouteSourceDisplay;
};

export function RouteStatusBadge({ source }: RouteStatusBadgeProps) {
  const { t } = useTranslation('kismet');

  const colorMap: Record<RouteSourceDisplay, string> = {
    'local': '#526B5D',
    'cloud': '#3A4B59',
    unavailable: '#8C857B',
  };

  const labelMap: Record<RouteSourceDisplay, string> = {
    'local': t('RouteStatus.local'),
    'cloud': t('RouteStatus.tokenApi'),
    unavailable: t('RouteStatus.unavailable'),
  };

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs"
      style={{
        border: `1px solid ${colorMap[source]}`,
        color: colorMap[source],
        padding: '3px 10px',
      }}
    >
      <span style={{ fontSize: '0.7rem', color: '#8C857B' }}>{t('RouteStatus.routeSource')}:</span>
      {labelMap[source]}
    </span>
  );
}
