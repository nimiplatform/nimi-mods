import { useTranslation } from 'react-i18next';
import type { KismetFortuneStickResult } from '../types.js';

type FortuneStickViewProps = {
  result: KismetFortuneStickResult;
  onShare: (text: string) => void;
};

const RANK_COLORS: Record<string, string> = {
  '上上签': '#A6382E',
  '上签': '#B5553A',
  '中上签': '#8A7254',
  '中签': '#8C857B',
  '中下签': '#6B7B8A',
  '下签': '#3A4B59',
  '下下签': '#2A3540',
};

function buildShareText(result: KismetFortuneStickResult): string {
  const lines = [
    `【天机求签 · 第${result.stickNumber}签 · ${result.rank}】`,
    '',
    ...result.poem,
    '',
    `解签: ${result.interpretation}`,
    '',
    `事业: ${result.career}`,
    `姻缘: ${result.relationship}`,
    `财运: ${result.wealth}`,
    `健康: ${result.health}`,
    '',
    `签语: ${result.advice}`,
    '',
    '#天机司命 #求签 #Kismet',
  ];
  return lines.join('\n');
}

export function FortuneStickView({ result, onShare }: FortuneStickViewProps) {
  const { t } = useTranslation('kismet');
  const rankColor = RANK_COLORS[result.rank] || '#8A7254';

  return (
    <div className="gu-card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Header seal */}
      <div style={{ padding: '28px 28px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div className="ks-serif" style={{ fontSize: '0.85rem', color: '#8C857B', letterSpacing: 2 }}>
            {t('FortuneStick.stickLabel')}{result.stickNumber}{t('FortuneStick.stickSuffix')}
          </div>
          <div
            className="ks-serif mt-2"
            style={{
              display: 'inline-block',
              padding: '4px 16px',
              border: `2px solid ${rankColor}`,
              color: rankColor,
              fontSize: '1.3rem',
              fontWeight: 900,
              letterSpacing: 6,
              transform: 'rotate(-2deg)',
            }}
          >
            {result.rank}
          </div>
        </div>
        <div className="text-xs" style={{ color: '#8C857B' }}>{result.rankEn}</div>
      </div>

      {/* Poem - vertical layout */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row-reverse',
          justifyContent: 'center',
          gap: 20,
          padding: '32px 28px',
          borderTop: '1px dashed rgba(138,114,84,0.2)',
          borderBottom: '1px dashed rgba(138,114,84,0.2)',
          marginTop: 20,
          background: 'rgba(10,9,8,0.4)',
        }}
      >
        {result.poem.map((line, i) => (
          <div
            key={i}
            className="ks-serif"
            style={{
              writingMode: 'vertical-rl',
              textOrientation: 'upright',
              fontSize: '1.15rem',
              color: '#E8E3D7',
              letterSpacing: 6,
              lineHeight: 2,
            }}
          >
            {line}
          </div>
        ))}
      </div>

      {/* Interpretation */}
      <div style={{ padding: '24px 28px' }}>
        <div className="ks-serif text-sm" style={{ color: '#8A7254', fontWeight: 600, marginBottom: 12 }}>
          {t('FortuneStick.interpretationTitle')}
        </div>
        <p className="ks-serif" style={{ fontSize: '0.95rem', lineHeight: 1.8, color: '#E8E3D7' }}>
          {result.interpretation}
        </p>
      </div>

      {/* Dimensions grid */}
      <div className="grid grid-cols-2 gap-px" style={{ background: 'rgba(138,114,84,0.15)' }}>
        {[
          { key: 'career', label: t('FortuneStick.career'), value: result.career },
          { key: 'relationship', label: t('FortuneStick.relationship'), value: result.relationship },
          { key: 'wealth', label: t('FortuneStick.wealth'), value: result.wealth },
          { key: 'health', label: t('FortuneStick.health'), value: result.health },
        ].map((item) => (
          <div key={item.key} style={{ padding: 20, background: '#181615' }}>
            <div className="ks-serif text-xs" style={{ color: '#8A7254', fontWeight: 600, marginBottom: 8 }}>{item.label}</div>
            <div className="ks-serif text-sm" style={{ color: '#E8E3D7', lineHeight: 1.6 }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* Advice */}
      <div style={{ padding: '24px 28px', borderTop: '1px solid rgba(138,114,84,0.2)' }}>
        <div className="ks-serif text-sm" style={{ color: '#8A7254', fontWeight: 600, marginBottom: 8 }}>
          {t('FortuneStick.adviceTitle')}
        </div>
        <p className="ks-serif" style={{ fontSize: '0.95rem', lineHeight: 1.8, color: '#E8E3D7' }}>
          {result.advice}
        </p>
      </div>

      {/* Share button */}
      <div style={{ padding: '0 28px 24px', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={() => onShare(buildShareText(result))}
          className="ks-serif"
          style={{
            padding: '8px 24px',
            background: 'transparent',
            border: '1px solid rgba(138,114,84,0.4)',
            color: '#8A7254',
            fontSize: '0.85rem',
            cursor: 'pointer',
            letterSpacing: 2,
            transition: 'all 0.3s',
          }}
        >
          {t('FortuneStick.share')}
        </button>
      </div>
    </div>
  );
}
