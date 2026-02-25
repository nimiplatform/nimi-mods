import { useTranslation } from 'react-i18next';
import { ANALYSIS_DIMENSIONS } from '../contracts.js';
import type { AnalysisDimension } from '../types.js';

type AnalysisReportProps = {
  analysis: AnalysisDimension;
};

export function AnalysisReport({ analysis }: AnalysisReportProps) {
  const { t } = useTranslation('kismet');

  return (
    <div className="space-y-3">
      {ANALYSIS_DIMENSIONS.map((dim) => {
        const text = analysis[dim] as string;
        const scoreKey = `${dim}Score` as keyof AnalysisDimension;
        const score = analysis[scoreKey] as number;

        return (
          <div key={dim} className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-800">
                {t(`AnalysisReport.${dim}`)}
              </h4>
              <span className="text-xs font-medium text-gray-500">
                {t('AnalysisReport.scoreLabel')}: {score}/10
              </span>
            </div>
            <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-indigo-500 transition-all"
                style={{ width: `${score * 10}%` }}
              />
            </div>
            <p className="text-xs leading-relaxed text-gray-600">{text}</p>
            {dim === 'crypto' && (
              <div className="mt-2 flex gap-4 text-xs text-gray-500">
                <span>{t('AnalysisReport.cryptoYear')}: {analysis.cryptoYear}</span>
                <span>{t('AnalysisReport.cryptoStyle')}: {analysis.cryptoStyle}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
