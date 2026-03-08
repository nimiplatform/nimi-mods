import { useTranslation } from 'react-i18next';
import type { KismetDailyFortuneResult } from '../types.js';

type DailyFortuneViewProps = {
  result: KismetDailyFortuneResult;
  loading: boolean;
  onDrawFortuneStick: () => void;
  onShare: (text: string) => void;
};

const CN_NUMERALS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

const COLOR_NAME_CSS: Record<string, string> = {
  '银白': '#C0C0C0', '金色': '#D4AF37',
  '青绿': '#5B8C5A', '翠色': '#3DAA6D',
  '深蓝': '#2E5A8E', '墨黑': '#3A3A3A',
  '赤红': '#C93A3A', '橙色': '#D4873A',
  '赭黄': '#B8944A', '棕色': '#8B6B3D',
};

function scoreColor(score: number): string {
  if (score >= 80) return '#D4AF37';
  if (score >= 70) return '#C9633A';
  if (score >= 60) return '#8A7254';
  return '#4A5B6A';
}

function ScoreCard(props: { title: string; score: number }) {
  const color = scoreColor(props.score);

  return (
    <div className="gu-card" style={{ padding: 18 }}>
      <div className="ks-serif text-xs" style={{ color: '#A6382E', fontWeight: 600, letterSpacing: 2 }}>{props.title}</div>
      <div className="ks-serif mt-2" style={{ fontSize: '2rem', fontWeight: 600, color }}>{props.score}</div>
      <div className="mt-3" style={{ height: 3, background: 'rgba(138,114,84,0.15)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${props.score}%`, background: color, transition: 'width 0.5s' }} />
      </div>
    </div>
  );
}

function buildDailyShareText(result: KismetDailyFortuneResult): string {
  const lines = [
    `【天机 · 今日运势 · ${result.date}】`,
    `干支: ${result.todayGanZhi}`,
    '',
    result.summary,
    '',
    `综合 ${result.overallScore} | 事业 ${result.careerScore} | 关系 ${result.relationshipScore} | 财运 ${result.wealthScore} | 健康 ${result.healthScore}`,
    '',
    `宜: ${result.recommendedActions.join('、')}`,
    `忌: ${result.avoidActions.join('、')}`,
    '',
    '#天机司命 #今日运势 #Kismet',
  ];
  return lines.join('\n');
}

export function DailyFortuneView({ result, loading, onDrawFortuneStick, onShare }: DailyFortuneViewProps) {
  const { t } = useTranslation('kismet');

  const overallSeal = Math.round(result.overallScore / 10);
  const sealColor = overallSeal >= 8 ? '#D4AF37' : overallSeal >= 6 ? '#C9633A' : '#4A5B6A';

  return (
    <div className="space-y-6">
      <div className="gu-card" style={{ padding: 28 }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="ks-serif" style={{ fontSize: '1.2rem', fontWeight: 600, color: '#8A7254', letterSpacing: 2 }}>{t('DailyFortune.title')}</h2>
            <p className="ks-serif mt-1 text-sm" style={{ color: '#8C857B' }}>
              {result.date} · {result.timezone} · {result.todayGanZhi}
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs" style={{ color: '#8C857B', letterSpacing: 1 }}>{t('DailyFortune.overallScore')}</div>
            <div
              className="ks-serif"
              style={{
                width: 44, height: 44,
                border: `2px solid ${sealColor}`, color: sealColor,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.3rem', fontWeight: 900, borderRadius: 4,
                transform: 'rotate(-3deg)', opacity: 0.85, marginTop: 4,
                boxShadow: `0 0 12px ${sealColor}40`,
              }}
            >
              {CN_NUMERALS[overallSeal] || overallSeal}
            </div>
          </div>
        </div>
        <div className="ks-serif mt-4" style={{ fontSize: '1.05rem', lineHeight: 1.8, color: '#E8E3D7', fontWeight: 300 }}>
          {result.summary}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ScoreCard title={t('DailyFortune.careerScore')} score={result.careerScore} />
        <ScoreCard title={t('DailyFortune.relationshipScore')} score={result.relationshipScore} />
        <ScoreCard title={t('DailyFortune.wealthScore')} score={result.wealthScore} />
        <ScoreCard title={t('DailyFortune.healthScore')} score={result.healthScore} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Lucky context */}
        <div className="gu-card" style={{ padding: 24 }}>
          <h3 className="ks-serif text-sm" style={{ color: '#D4AF37', fontWeight: 600, letterSpacing: 2 }}>{t('DailyFortune.luckyTitle')}</h3>
          <div className="mt-4 space-y-3 text-sm">
            <div>
              <span className="ks-serif" style={{ color: '#8C857B', letterSpacing: 1 }}>{t('DailyFortune.luckyElements')}: </span>
              <span className="ks-serif" style={{ color: '#D4AF37', fontWeight: 500 }}>{result.luckyElements.join(' / ')}</span>
            </div>
            <div>
              <span className="ks-serif" style={{ color: '#8C857B', letterSpacing: 1 }}>{t('DailyFortune.luckyDirections')}: </span>
              <span className="ks-serif" style={{ color: '#D4AF37', fontWeight: 500 }}>{result.luckyDirections.join(' / ')}</span>
            </div>
            <div>
              <span className="ks-serif" style={{ color: '#8C857B', letterSpacing: 1 }}>{t('DailyFortune.luckyColors')}: </span>
              {result.luckyColors.map((c, i) => (
                <span key={c}>
                  {i > 0 && <span style={{ color: '#8C857B' }}> / </span>}
                  <span className="ks-serif" style={{ color: COLOR_NAME_CSS[c] || '#D4AF37', fontWeight: 600 }}>{c}</span>
                </span>
              ))}
            </div>
            <div>
              <span className="ks-serif" style={{ color: '#8C857B', letterSpacing: 1 }}>{t('DailyFortune.luckyNumbers')}: </span>
              <span className="ks-serif" style={{ color: '#D4AF37', fontWeight: 500 }}>{result.luckyNumbers[0]}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="gu-card" style={{ padding: 24 }}>
          <h3 className="ks-serif text-sm" style={{ color: '#A6382E', fontWeight: 600, letterSpacing: 2 }}>{t('DailyFortune.actionsTitle')}</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <div className="gu-tag ks-serif mb-2 inline-block text-xs" style={{ color: '#526B5D', fontWeight: 600 }}>{t('DailyFortune.recommendedActions')}</div>
              <ul className="space-y-2 text-sm" style={{ color: '#E8E3D7' }}>
                {result.recommendedActions.map((item) => <li key={item}><span style={{ color: '#526B5D' }}>·</span> {item}</li>)}
              </ul>
            </div>
            <div>
              <div className="gu-tag ks-serif mb-2 inline-block text-xs" style={{ color: '#A6382E', fontWeight: 600 }}>{t('DailyFortune.avoidActions')}</div>
              <ul className="space-y-2 text-sm" style={{ color: '#E8E3D7' }}>
                {result.avoidActions.map((item) => <li key={item}><span style={{ color: '#A6382E' }}>·</span> {item}</li>)}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Action buttons: Fortune Stick + Share */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onDrawFortuneStick}
          disabled={loading}
          className="ks-btn-seal flex-1"
          style={{ letterSpacing: '4px', maxWidth: 280 }}
        >
          {loading ? t('FortuneStick.generating') : t('FortuneStick.drawButton')}
        </button>
        <button
          type="button"
          onClick={() => onShare(buildDailyShareText(result))}
          className="ks-serif"
          style={{
            padding: '14px 28px',
            background: 'transparent',
            border: '1px solid rgba(138,114,84,0.4)',
            color: '#8A7254',
            fontSize: '1rem',
            cursor: 'pointer',
            letterSpacing: 2,
            transition: 'all 0.3s',
          }}
        >
          {t('DailyFortune.shareButton')}
        </button>
      </div>

    </div>
  );
}
