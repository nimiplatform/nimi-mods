import { useTranslation } from 'react-i18next';
import type { KismetCompatibilityResult } from '../types.js';

type CompatibilityViewProps = {
  result: KismetCompatibilityResult;
};

const CN_NUMERALS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

export function CompatibilityView({ result }: CompatibilityViewProps) {
  const { t } = useTranslation('kismet');

  const tens = Math.round(result.overallScore / 10);
  const sealColor = tens >= 8 ? '#A6382E' : tens >= 6 ? '#8A7254' : '#3A4B59';

  return (
    <div className="space-y-6">
      <div className="gu-card" style={{ padding: 28 }}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="ks-serif" style={{ fontSize: '1.2rem', fontWeight: 600, color: '#8A7254', letterSpacing: 2 }}>
              {t('Compatibility.title')}
            </h2>
            <p className="ks-serif mt-1 text-sm" style={{ color: '#8C857B' }}>{result.fiveElementRelation}</p>
          </div>
          <div className="text-right">
            <div className="text-xs" style={{ color: '#8C857B', letterSpacing: 1 }}>{t('Compatibility.overallScore')}</div>
            <div
              className="ks-serif"
              style={{
                width: 44, height: 44,
                border: `2px solid ${sealColor}`, color: sealColor,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.3rem', fontWeight: 900, borderRadius: 4,
                transform: 'rotate(-3deg)', opacity: 0.85, marginTop: 4,
              }}
            >
              {CN_NUMERALS[tens] || tens}
            </div>
          </div>
        </div>
        <div className="ks-serif mt-4" style={{ fontSize: '1.05rem', lineHeight: 1.8, color: '#E8E3D7', fontWeight: 300 }}>
          {result.summary}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="gu-card" style={{ padding: 24 }}>
          <h3 className="ks-serif mb-3 text-sm" style={{ color: '#8A7254', fontWeight: 600 }}>{t('Compatibility.complementaryAreas')}</h3>
          <ul className="space-y-2 text-sm" style={{ color: '#E8E3D7' }}>
            {result.complementaryAreas.map((item) => <li key={item}>· {item}</li>)}
          </ul>
        </div>
        <div className="gu-card" style={{ padding: 24 }}>
          <h3 className="ks-serif mb-3 text-sm" style={{ color: '#8A7254', fontWeight: 600 }}>{t('Compatibility.tensionAreas')}</h3>
          {result.tensionAreas.length > 0 ? (
            <ul className="space-y-2 text-sm" style={{ color: '#E8E3D7' }}>
              {result.tensionAreas.map((item) => <li key={item}>· {item}</li>)}
            </ul>
          ) : (
            <p className="text-sm" style={{ color: '#8C857B' }}>{t('Compatibility.noTensionAreas')}</p>
          )}
        </div>
      </div>

      <div className="gu-card" style={{ padding: 24 }}>
        <h3 className="ks-serif mb-3 text-sm" style={{ color: '#8A7254', fontWeight: 600 }}>{t('Compatibility.advice')}</h3>
        <div className="ks-serif" style={{ fontSize: '1.05rem', lineHeight: 1.8, color: '#E8E3D7', fontWeight: 300 }}>
          {result.advice}
        </div>
      </div>
    </div>
  );
}
