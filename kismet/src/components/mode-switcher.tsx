import { useTranslation } from 'react-i18next';
import type { KismetFeatureTab } from '../types.js';

type ModeSwitcherProps = {
  activeTab: KismetFeatureTab;
  onTabChange: (tab: KismetFeatureTab) => void;
};

const TABS: KismetFeatureTab[] = ['natal-profile', 'daily-fortune', 'compatibility'];

export function ModeSwitcher({ activeTab, onTabChange }: ModeSwitcherProps) {
  const { t } = useTranslation('kismet');

  return (
    <div className="flex" style={{ border: '1px solid rgba(138,114,84,0.3)' }}>
      {TABS.map((tab, i) => {
        const active = tab === activeTab;
        return (
          <button
            key={tab}
            type="button"
            onClick={() => onTabChange(tab)}
            className="ks-serif flex-1"
            style={{
              padding: '8px 12px',
              fontSize: '0.8rem',
              background: active ? 'rgba(138,114,84,0.15)' : 'transparent',
              color: active ? '#8A7254' : '#8C857B',
              border: 'none',
              borderRight: i < TABS.length - 1 ? '1px solid rgba(138,114,84,0.2)' : 'none',
              cursor: 'pointer',
              letterSpacing: 1,
              transition: 'all 0.3s',
            }}
          >
            {t(`Tabs.${tab}`)}
          </button>
        );
      })}
    </div>
  );
}
