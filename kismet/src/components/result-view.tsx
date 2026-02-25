import { useTranslation } from 'react-i18next';
import { KlineChart } from './kline-chart.js';
import { AnalysisReport } from './analysis-report.js';
import type { KismetResult } from '../types.js';

type ResultViewProps = {
  result: KismetResult;
};

export function ResultView({ result }: ResultViewProps) {
  const { t } = useTranslation('kismet');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-3 text-base font-semibold text-gray-900">
          {t('ResultView.chartTitle')}
        </h2>
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white p-4">
          <KlineChart data={result.chartData} />
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-base font-semibold text-gray-900">
          {t('ResultView.analysisTitle')}
        </h2>
        <AnalysisReport analysis={result.analysis} />
      </div>
    </div>
  );
}
