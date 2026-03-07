import { useTranslation } from 'react-i18next';
import type { KismetDailyFortuneResult } from '../types.js';

type DailyFortuneViewProps = {
  result: KismetDailyFortuneResult;
};

const CN_NUMERALS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

function ScoreCard(props: { title: string; score: number }) {
  const tens = Math.round(props.score / 10);
  const color = tens >= 8 ? '#A6382E' : tens >= 6 ? '#8A7254' : '#3A4B59';

  return (
    <div className="gu-card" style={{ padding: 18 }}>
      <div className="text-xs" style={{ color: '#8C857B' }}>{props.title}</div>
      <div className="ks-serif mt-2" style={{ fontSize: '2rem', fontWeight: 600, color: '#E8E3D7' }}>{props.score}</div>
      <div className="mt-3" style={{ height: 3, background: 'rgba(138,114,84,0.15)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${props.score}%`, background: color, transition: 'width 0.5s' }} />
      </div>
    </div>
  );
}

export function DailyFortuneView({ result }: DailyFortuneViewProps) {
  const { t } = useTranslation('kismet');

  const overallSeal = Math.round(result.overallScore / 10);
  const sealColor = overallSeal >= 8 ? '#A6382E' : overallSeal >= 6 ? '#8A7254' : '#3A4B59';

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
        <div className="gu-card" style={{ padding: 24 }}>
          <h3 className="ks-serif text-sm" style={{ color: '#8A7254', fontWeight: 600 }}>{t('DailyFortune.luckyTitle')}</h3>
          <div className="mt-4 space-y-2 text-sm" style={{ color: '#E8E3D7' }}>
            <div><span style={{ color: '#8C857B' }}>{t('DailyFortune.luckyElements')}: </span>{result.luckyElements.join(' / ')}</div>
            <div><span style={{ color: '#8C857B' }}>{t('DailyFortune.luckyDirections')}: </span>{result.luckyDirections.join(' / ')}</div>
            <div><span style={{ color: '#8C857B' }}>{t('DailyFortune.luckyColors')}: </span>{result.luckyColors.join(' / ')}</div>
            <div><span style={{ color: '#8C857B' }}>{t('DailyFortune.luckyNumbers')}: </span>{result.luckyNumbers.join(' / ')}</div>
          </div>
        </div>

        <div className="gu-card" style={{ padding: 24 }}>
          <h3 className="ks-serif text-sm" style={{ color: '#8A7254', fontWeight: 600 }}>{t('DailyFortune.actionsTitle')}</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <div className="gu-tag ks-serif mb-2 inline-block text-xs" style={{ color: '#526B5D' }}>{t('DailyFortune.recommendedActions')}</div>
              <ul className="space-y-2 text-sm" style={{ color: '#E8E3D7' }}>
                {result.recommendedActions.map((item) => <li key={item}>· {item}</li>)}
              </ul>
            </div>
            <div>
              <div className="gu-tag ks-serif mb-2 inline-block text-xs" style={{ color: '#A6382E' }}>{t('DailyFortune.avoidActions')}</div>
              <ul className="space-y-2 text-sm" style={{ color: '#E8E3D7' }}>
                {result.avoidActions.map((item) => <li key={item}>· {item}</li>)}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
