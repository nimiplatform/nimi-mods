import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ElementKey, FiveElementDistribution, KismetNatalAnalysisResult } from '../types.js';
import { ELEMENT_LABELS } from '../services/bazi/constants.js';
import { KlineChart } from './kline-chart.js';
import { AnalysisReport } from './analysis-report.js';
import { ShareCardModal } from './share-card-modal.js';

const ELEMENT_CONFIG: Array<{ key: ElementKey; label: string; color: string }> = [
  { key: 'metal', label: '金', color: '#D1D1D1' },
  { key: 'wood', label: '木', color: '#526B5D' },
  { key: 'water', label: '水', color: '#3A4B59' },
  { key: 'fire', label: '火', color: '#A6382E' },
  { key: 'earth', label: '土', color: '#B08D57' },
];

const CN_RANKS = ['一', '二', '三', '四', '五'];

function sectorPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const x1 = cx + r * Math.cos(toRad(startAngle));
  const y1 = cy + r * Math.sin(toRad(startAngle));
  const x2 = cx + r * Math.cos(toRad(endAngle));
  const y2 = cy + r * Math.sin(toRad(endAngle));
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc} 1 ${x2},${y2} Z`;
}

function FiveElementRose({ ratio }: { ratio: FiveElementDistribution }) {
  const size = 240;
  const cx = size / 2;
  const cy = size / 2;
  const maxRadius = size / 2 - 12;
  const minRadius = maxRadius * 0.2;
  const sliceAngle = 360 / ELEMENT_CONFIG.length;

  const maxValue = Math.max(...ELEMENT_CONFIG.map((el) => ratio[el.key]), 1);

  const sectors = ELEMENT_CONFIG.map((el, i) => {
    const value = ratio[el.key];
    const r = minRadius + ((value / maxValue) * (maxRadius - minRadius));
    const startAngle = -90 + i * sliceAngle;
    const endAngle = startAngle + sliceAngle;
    const midAngle = startAngle + sliceAngle / 2;
    const labelR = r + 14;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const labelX = cx + labelR * Math.cos(toRad(midAngle));
    const labelY = cy + labelR * Math.sin(toRad(midAngle));
    return { ...el, value, r, startAngle, endAngle, labelX, labelY };
  });

  return (
    <div className="flex items-center gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        {sectors.map((s) => (
          <path
            key={s.key}
            d={sectorPath(cx, cy, s.r, s.startAngle, s.endAngle)}
            fill={s.color}
            stroke="#181615"
            strokeWidth={1.5}
            opacity={0.88}
          />
        ))}
        {sectors.map((s) => (
          <text
            key={`label-${s.key}`}
            x={s.labelX}
            y={s.labelY}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#E8E3D7"
            fontSize={12}
            fontWeight={600}
            fontFamily="var(--font-serif)"
          >
            {s.label}
          </text>
        ))}
      </svg>
      <div className="ks-serif space-y-3">
        {sectors.map((s) => (
          <div key={s.key} className="flex items-center gap-3 text-sm">
            <span className="inline-block h-2 w-2 rotate-45" style={{ backgroundColor: s.color }} />
            <span style={{ color: '#8C857B' }}>{s.label}</span>
            <span className="ks-serif" style={{ color: '#8A7254', minWidth: 36, textAlign: 'right' }}>{s.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

type ResultViewProps = {
  result: KismetNatalAnalysisResult;
};

export function ResultView({ result }: ResultViewProps) {
  const { t } = useTranslation('kismet');
  const [shareOpen, setShareOpen] = useState(false);

  const displayName = result.canonicalProfile.dayMaster.label + ' · ' + result.canonicalProfile.zodiac;

  return (
    <div className="space-y-6">
      {/* Natal Core */}
      <div className="gu-card" style={{ padding: 28 }}>
        <div className="mb-5 flex items-start justify-between">
          <div>
            <div className="flex items-baseline gap-3">
              <h2 className="ks-serif" style={{ fontSize: '1.2rem', fontWeight: 600, color: '#8A7254', letterSpacing: 2 }}>
                {t('ResultView.profileTitle')}
              </h2>
              <span className="text-sm" style={{ color: '#8C857B' }}>Natal Core</span>
            </div>
            <p className="ks-serif mt-2" style={{ fontSize: '1.1rem', color: '#E8E3D7' }}>
              <span style={{ color: '#A6382E', marginRight: 4 }}>{result.canonicalProfile.dayMaster.label}</span>
              · {result.canonicalProfile.zodiac}
            </p>
          </div>
          <div className="ks-serif flex items-center gap-3" style={{ border: '1px solid rgba(138,114,84,0.3)', background: 'rgba(0,0,0,0.2)', padding: '4px 12px' }}>
            <span style={{ color: '#8A7254', letterSpacing: 2 }}>{result.canonicalProfile.pillars.year}</span>
            <span style={{ color: 'rgba(138,114,84,0.3)' }}>|</span>
            <span style={{ color: '#8A7254', letterSpacing: 2 }}>{result.canonicalProfile.pillars.month}</span>
            <span style={{ color: 'rgba(138,114,84,0.3)' }}>|</span>
            <span style={{ color: '#8A7254', letterSpacing: 2 }}>{result.canonicalProfile.pillars.day}</span>
            <span style={{ color: 'rgba(138,114,84,0.3)' }}>|</span>
            <span style={{ color: '#8A7254', letterSpacing: 2 }}>{result.canonicalProfile.pillars.hour}</span>
          </div>
        </div>

        <div className="flex items-center gap-10">
          <FiveElementRose ratio={result.canonicalProfile.fiveElementRatio} />

          <div className="flex-1 space-y-4" style={{ borderLeft: '1px dashed rgba(138,114,84,0.2)', paddingLeft: 30 }}>
            <div className="flex gap-3">
              <span className="gu-tag ks-serif text-sm" style={{ color: '#3A4B59' }}>
                {t('ResultView.favorableElements')} {result.canonicalProfile.favorableElements.map((e) => ELEMENT_LABELS[e as ElementKey] || e).join('/')}
              </span>
              <span className="gu-tag ks-serif text-sm" style={{ color: '#A6382E' }}>
                {t('ResultView.unfavorableElements')} {result.canonicalProfile.unfavorableElements.map((e) => ELEMENT_LABELS[e as ElementKey] || e).join('/')}
              </span>
            </div>
            <div
              className="ks-serif"
              style={{
                fontSize: '1.05rem',
                lineHeight: 1.8,
                color: '#E8E3D7',
                fontWeight: 300,
                background: 'rgba(138,114,84,0.03)',
                padding: 14,
                borderLeft: '2px solid #8A7254',
              }}
            >
              {result.analysis.partnerAffinitySummary}
            </div>
          </div>
        </div>
      </div>

      {/* Zodiac Year Fortune */}
      {result.analysis.zodiacYearFortune && (
        <div className="gu-card" style={{ padding: 28 }}>
          <h2 className="ks-serif mb-5" style={{ fontSize: '1.2rem', fontWeight: 600, color: '#8A7254', letterSpacing: 2 }}>
            {t('ResultView.zodiacFortuneTitle')}
            <span className="ml-3" style={{ fontSize: '0.85rem', fontWeight: 400, color: '#8C857B' }}>
              {result.analysis.zodiacYearFortune.year} · {result.analysis.zodiacYearFortune.zodiac}
            </span>
          </h2>
          <div className="grid gap-4 lg:grid-cols-3">
            {(['wealth', 'relationship', 'career'] as const).map((key) => (
              <div key={key} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(138,114,84,0.15)', padding: 16 }}>
                <div className="ks-serif mb-2 text-sm" style={{ color: '#8A7254', fontWeight: 600 }}>
                  {t(`ResultView.zodiac_${key}`)}
                </div>
                <div className="ks-serif" style={{ fontSize: '0.95rem', lineHeight: 1.8, color: '#E8E3D7', fontWeight: 300 }}>
                  {result.analysis.zodiacYearFortune[key]}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Birth City & Recommended Cities */}
      <div className="gu-card" style={{ padding: 28 }}>
        <h2 className="ks-serif mb-5" style={{ fontSize: '1.2rem', fontWeight: 600, color: '#8A7254', letterSpacing: 2 }}>
          {t('ResultView.cityAffinityTitle')}
          <span className="ml-3" style={{ fontSize: '0.85rem', fontWeight: 400, color: '#8C857B' }}>Recommended Cities</span>
        </h2>
        <div className="mb-4 flex items-center gap-3">
          <span className="text-sm" style={{ color: '#8C857B' }}>{t('ResultView.birthCityTitle')}:</span>
          <span className="ks-serif" style={{ fontSize: '1rem', color: '#E8E3D7', fontWeight: 500 }}>{result.birthCityLabel}</span>
        </div>
        {result.citySummary && (
          <div className="ks-serif mb-5" style={{ fontSize: '0.95rem', lineHeight: 1.8, color: '#8C857B' }}>
            {result.citySummary}
          </div>
        )}
        {result.recommendedCities.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-3">
            {result.recommendedCities.slice(0, 3).map((city) => (
              <div
                key={city.name}
                className="flex flex-col items-center gap-2 transition-all hover:-translate-y-0.5"
                style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(138,114,84,0.15)', padding: 16, textAlign: 'center' }}
              >
                <span className="ks-serif" style={{ fontSize: '1.1rem', fontWeight: 600, color: '#E8E3D7' }}>{city.name}</span>
                <span className="text-xs" style={{ color: '#8A7254' }}>契合: {city.score}</span>
                <span className="ks-serif text-xs" style={{ color: '#8C857B', lineHeight: 1.5 }}>{city.description}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Life K-Line */}
      <div className="gu-card" style={{ padding: 28 }}>
        <div className="mb-1 flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <h2 className="ks-serif" style={{ fontSize: '1.2rem', fontWeight: 600, color: '#8A7254', letterSpacing: 2 }}>
              {t('ResultView.chartTitle')}
            </h2>
            <span className="text-sm" style={{ color: '#8C857B' }}>Life K-Line</span>
          </div>
          <span className="text-xs" style={{ color: '#8C857B' }}>* 朱砂为涨/吉，远山青为跌/凶</span>
        </div>
        <KlineChart data={result.chartData} />
      </div>

      {/* Narrative Analysis */}
      <div>
        <div className="mb-4 flex items-baseline gap-3">
          <h2 className="ks-serif" style={{ fontSize: '1.2rem', fontWeight: 600, color: '#8A7254', letterSpacing: 2 }}>
            {t('ResultView.analysisTitle')}
          </h2>
          <span className="text-sm" style={{ color: '#8C857B' }}>Overall Analysis</span>
        </div>
        <AnalysisReport analysis={result.analysis} />
      </div>

      {/* Share Card Button */}
      <div className="flex justify-center" style={{ paddingTop: 12, paddingBottom: 8 }}>
        <button
          type="button"
          onClick={() => setShareOpen(true)}
          className="ks-serif"
          style={{
            padding: '12px 40px',
            background: 'transparent',
            border: '1px solid #dcb347',
            color: '#dcb347',
            fontSize: '1rem',
            fontWeight: 600,
            letterSpacing: 6,
            cursor: 'pointer',
            transition: 'all 0.4s',
          }}
        >
          {t('ShareCard.generate')}
        </button>
      </div>

      <ShareCardModal
        result={result}
        name={displayName}
        open={shareOpen}
        onClose={() => setShareOpen(false)}
      />
    </div>
  );
}
