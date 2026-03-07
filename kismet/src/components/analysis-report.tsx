import { useTranslation } from 'react-i18next';
import { ANALYSIS_DIMENSIONS } from '../contracts.js';
import type { NatalAnalysisText } from '../types.js';

const CN_NUMERALS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

function sealColor(score: number): string {
  if (score >= 8) return '#A6382E';
  if (score >= 6) return '#8A7254';
  return '#3A4B59';
}

function SealScore({ score }: { score: number }) {
  const color = sealColor(score);
  return (
    <div
      className="ks-serif shrink-0"
      style={{
        width: 36,
        height: 36,
        border: `2px solid ${color}`,
        color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '1.1rem',
        fontWeight: 900,
        borderRadius: 4,
        transform: 'rotate(-3deg)',
        opacity: 0.85,
      }}
    >
      {CN_NUMERALS[score] || score}
    </div>
  );
}

function tagColor(tag: string): string {
  if (tag.startsWith('宜')) return '#3A4B59';
  if (tag.startsWith('忌')) return '#A6382E';
  return '#8A7254';
}

function DimensionTags({ tags }: { tags?: string[] }) {
  if (!tags || tags.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {tags.map((tag) => (
        <span key={tag} className="gu-tag ks-serif text-xs" style={{ color: tagColor(tag) }}>
          {tag}
        </span>
      ))}
    </div>
  );
}

type AnalysisReportProps = {
  analysis: NatalAnalysisText;
};

export function AnalysisReport({ analysis }: AnalysisReportProps) {
  const { t } = useTranslation('kismet');
  const [, ...rest] = ANALYSIS_DIMENSIONS;
  const tags = analysis.tags;

  return (
    <div className="space-y-5">
      {/* Featured summary */}
      <div className="gu-card" style={{ padding: 28 }}>
        <div className="mb-4 flex items-start justify-between">
          <h4 className="ks-serif" style={{ fontSize: '1.1rem', fontWeight: 600, color: '#8A7254', letterSpacing: 2 }}>
            {t('AnalysisReport.summary')}
          </h4>
          <SealScore score={analysis.scores.summary} />
        </div>
        <div className="ks-serif" style={{ fontSize: '1.05rem', lineHeight: 1.8, color: '#E8E3D7', fontWeight: 300 }}>
          {analysis.summary}
        </div>
        <DimensionTags tags={tags?.summary} />
      </div>

      {/* Dimension cards */}
      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        {rest.map((dimension) => (
          <div key={dimension} className="gu-card" style={{ padding: 22 }}>
            <div className="mb-4 flex items-start justify-between">
              <h4 className="ks-serif" style={{ fontSize: '1rem', fontWeight: 600, color: '#8A7254', letterSpacing: 1 }}>
                {t(`AnalysisReport.${dimension}`)}
              </h4>
              <SealScore score={analysis.scores[dimension]} />
            </div>
            <div className="ks-serif" style={{ fontSize: '0.95rem', lineHeight: 1.8, color: '#E8E3D7', fontWeight: 300 }}>
              {analysis[dimension]}
            </div>
            <DimensionTags tags={tags?.[dimension]} />
            {dimension === 'crypto' && (
              <div className="mt-4 flex gap-3 text-xs" style={{ color: '#8C857B' }}>
                <span className="gu-tag ks-serif">{t('AnalysisReport.cryptoYear')}: {analysis.cryptoYear}</span>
                <span className="gu-tag ks-serif">{t('AnalysisReport.cryptoStyle')}: {analysis.cryptoStyle}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
