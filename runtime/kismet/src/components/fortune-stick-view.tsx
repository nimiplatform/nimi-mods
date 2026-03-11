import { useTranslation } from 'react-i18next';
import type { KismetFortuneStickResult } from '../types.js';
import { FORTUNE_STICK_BG_BASE64 } from '../assets/fortune-stick-bg.js';

type FortuneStickViewProps = {
  result: KismetFortuneStickResult;
  onShare: (text: string) => void;
};

const RANK_SEAL_COLOR: Record<string, string> = {
  '上上签': '#D4AF37',
  '上签': '#C9633A',
  '中上签': '#8A7254',
  '中签': '#9B8968',
  '中下签': '#6B7B8A',
  '下签': '#4A5B6A',
  '下下签': '#3A4550',
};

/** Dark ink color on the parchment for each rank */
const RANK_INK_COLOR: Record<string, string> = {
  '上上签': '#8B6914',
  '上签': '#8B4513',
  '中上签': '#6B5A3E',
  '中签': '#5C5040',
  '中下签': '#4A5060',
  '下签': '#3A4555',
  '下下签': '#333B42',
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
  const sealColor = RANK_SEAL_COLOR[result.rank] || '#9B8968';
  const inkColor = RANK_INK_COLOR[result.rank] || '#5C5040';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* ── Image card with background ── */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 480,
          aspectRatio: '3 / 4',
          margin: '0 auto',
          backgroundImage: `url('${FORTUNE_STICK_BG_BASE64}')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          boxShadow: '0 12px 60px rgba(0,0,0,0.6)',
          overflow: 'hidden',
        }}
      >
        {/* ── Parchment overlay area — all content on the scroll ── */}
        <div
          style={{
            position: 'absolute',
            top: '28%',
            left: '28%',
            right: '28%',
            bottom: '28%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            zIndex: 4,
            padding: '14px 10px',
          }}
        >
          {/* Stick number at top */}
          <div
            className="ks-serif"
            style={{
              fontSize: '0.95rem',
              fontWeight: 600,
              color: '#8B6914',
              letterSpacing: 4,
              marginBottom: 6,
            }}
          >
            {t('FortuneStick.stickLabel')}{result.stickNumber}{t('FortuneStick.stickSuffix')}
          </div>

          {/* Poem vertical text */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'row-reverse',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 16,
            }}
          >
            {result.poem.map((line, lineIdx) => (
              <div
                key={lineIdx}
                className="ks-serif"
                style={{
                  writingMode: 'vertical-rl',
                  textOrientation: 'upright',
                  fontSize: '1.15rem',
                  letterSpacing: 6,
                  lineHeight: 1.8,
                }}
              >
                {[...line].map((char, ci) => {
                  const isFirst = ci === 0;
                  const isLast = ci === line.length - 1;
                  return (
                    <span
                      key={ci}
                      style={{
                        color: isFirst ? '#8B6914' : isLast ? '#8B2620' : inkColor,
                        textShadow: isFirst
                          ? '0 0 6px rgba(139,105,20,0.2)'
                          : isLast
                            ? '0 0 6px rgba(139,38,32,0.2)'
                            : 'none',
                      }}
                    >
                      {char}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Rank attribute at bottom of parchment */}
          <div
            className="ks-serif"
            style={{
              marginTop: 8,
              fontSize: '1rem',
              color: '#8B2620',
              letterSpacing: 6,
              fontWeight: 700,
            }}
          >
            {result.rank}
          </div>
        </div>

        {/* ── Footer watermark on card ── */}
        <div
          className="ks-serif"
          style={{
            position: 'absolute',
            bottom: '3%',
            right: '4%',
            zIndex: 5,
            fontSize: '0.6rem',
            color: 'rgba(232,227,215,0.35)',
            letterSpacing: 2,
            textShadow: '0 1px 3px rgba(0,0,0,0.6)',
          }}
        >
          天机司命 · Kismet
        </div>
      </div>

      {/* ── Details below the card ── */}
      <div
        style={{
          maxWidth: 480,
          margin: '0 auto',
          width: '100%',
        }}
      >
        {/* Interpretation */}
        <div
          style={{
            padding: '24px 28px',
            background: '#0E0D0B',
            border: '1px solid rgba(138,114,84,0.2)',
            marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 3, height: 16, background: '#A6382E' }} />
            <span className="ks-serif" style={{ fontSize: '0.9rem', color: '#A6382E', fontWeight: 600, letterSpacing: 3 }}>
              {t('FortuneStick.interpretationTitle')}
            </span>
          </div>
          <p className="ks-serif" style={{ fontSize: '0.95rem', lineHeight: 2, color: '#E8E3D7', fontWeight: 300, paddingLeft: 13 }}>
            {result.interpretation}
          </p>
        </div>

        {/* Four dimensions */}
        <div className="grid grid-cols-2" style={{ gap: 1, background: 'rgba(138,114,84,0.1)', marginBottom: 16 }}>
          {[
            { key: 'career', label: t('FortuneStick.career'), value: result.career },
            { key: 'relationship', label: t('FortuneStick.relationship'), value: result.relationship },
            { key: 'wealth', label: t('FortuneStick.wealth'), value: result.wealth },
            { key: 'health', label: t('FortuneStick.health'), value: result.health },
          ].map((item) => (
            <div key={item.key} style={{ padding: '18px 16px', background: '#0E0D0B' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 2, height: 12, background: '#A6382E' }} />
                <span className="ks-serif" style={{ fontSize: '0.8rem', color: '#A6382E', fontWeight: 600, letterSpacing: 2 }}>{item.label}</span>
              </div>
              <div className="ks-serif" style={{ fontSize: '0.85rem', color: '#C8C2B6', lineHeight: 1.8, paddingLeft: 10 }}>{item.value}</div>
            </div>
          ))}
        </div>

        {/* Advice */}
        <div
          style={{
            padding: '24px 28px',
            background: '#0E0D0B',
            border: '1px solid rgba(138,114,84,0.2)',
            marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 3, height: 16, background: '#D4AF37' }} />
            <span className="ks-serif" style={{ fontSize: '0.9rem', color: '#D4AF37', fontWeight: 600, letterSpacing: 3 }}>
              {t('FortuneStick.adviceTitle')}
            </span>
          </div>
          <p className="ks-serif" style={{ fontSize: '0.95rem', lineHeight: 2, color: '#E8E3D7', fontWeight: 300, paddingLeft: 13 }}>
            {result.advice}
          </p>
        </div>

        {/* Share button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => onShare(buildShareText(result))}
            className="ks-serif"
            style={{
              padding: '10px 32px',
              background: 'transparent',
              border: '1px solid rgba(138,114,84,0.3)',
              color: '#8A7254',
              fontSize: '0.8rem',
              cursor: 'pointer',
              letterSpacing: 3,
              transition: 'all 0.3s',
            }}
          >
            {t('FortuneStick.share')}
          </button>
        </div>
      </div>
    </div>
  );
}
