import React from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import type { LocalChatPromptTrace, LocalChatTurnAudit } from '../../state/index.js';
import type { HealthStatus } from '../../types.js';

type Props = {
  open: boolean;
  onToggle: () => void;
  latestPromptTrace: LocalChatPromptTrace | null;
  latestTurnAudit: LocalChatTurnAudit | null;
  healthStatus: HealthStatus;
  checkingHealth: boolean;
  onHealthCheck: () => void;
};

const C = {
  gray800: '#1f2937',
} as const;

export function DiagnosticsPanel(props: Props) {
  const { t } = useModTranslation('local-chat');
  const {
    open,
    onToggle,
    latestPromptTrace,
    latestTurnAudit,
    healthStatus,
    checkingHealth,
    onHealthCheck,
  } = props;

  return (
    <div className="rounded-[10px] border border-gray-200 bg-gray-50 p-3 text-xs">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-left text-gray-700 font-medium"
      >
        <span>{t('Diagnostics.title')}</span>
        <span>{open ? '-' : '+'}</span>
      </button>
      {open ? (
        <div className="mt-2">
          <p className="text-gray-700">
            Route: {latestPromptTrace?.routeSource || '-'} / {latestPromptTrace?.routeModel || '-'}
          </p>
          <p className="mt-1 text-gray-700">Prompt chars: {latestPromptTrace?.promptChars ?? '-'}</p>
          <p className="mt-1 text-gray-700">
            Compiler: {latestPromptTrace?.compilerVersion || '-'}
          </p>
          <p className="mt-1 text-gray-700">
            Layers: {latestPromptTrace?.appliedLayers?.length ?? '-'}
            {Array.isArray(latestPromptTrace?.layerOrder)
              ? ` / ${latestPromptTrace.layerOrder.length}`
              : ''}
          </p>
          <p className="mt-1 text-gray-700">
            Memory slices: {latestPromptTrace
              ? `core ${latestPromptTrace.memorySlices?.core ?? 0} · e2e ${latestPromptTrace.memorySlices?.e2e ?? 0} · world ${latestPromptTrace.memorySlices?.worldLore ?? 0} · agent ${latestPromptTrace.memorySlices?.agentLore ?? 0}`
              : '-'}
          </p>
          <p className="mt-1 text-gray-700">
            Prompt budget: {latestPromptTrace
              ? `${latestPromptTrace.budget?.usedChars ?? 0}/${latestPromptTrace.budget?.maxChars ?? 0}${latestPromptTrace.budget?.truncated ? ' (truncated)' : ''}`
              : '-'}
          </p>
          <p className="mt-1 text-gray-700">Retry: {latestPromptTrace ? `${latestPromptTrace.retryAttempted ? 'yes' : 'no'}${latestPromptTrace.retryImproved ? ' (improved)' : ''}` : '-'}</p>
          <p className="mt-1 text-gray-700">
            Planner: {latestPromptTrace?.planner || '-'}
          </p>
          <p className="mt-1 text-gray-700">
            Segments: {latestPromptTrace?.planSegments ?? '-'}
            {typeof latestPromptTrace?.textSegments === 'number' || typeof latestPromptTrace?.voiceSegments === 'number'
              ? ` (text ${latestPromptTrace?.textSegments ?? 0} / voice ${latestPromptTrace?.voiceSegments ?? 0})`
              : ''}
          </p>
          <p className="mt-1 text-gray-700">
            Scheduler delay: {typeof latestPromptTrace?.schedulerTotalDelayMs === 'number' ? `${latestPromptTrace.schedulerTotalDelayMs}ms` : '-'}
          </p>
          <p className="mt-2 text-gray-500">Latency</p>
          <p className="font-medium text-gray-900">{latestTurnAudit ? `${latestTurnAudit.latencyMs}ms` : '-'}</p>
          <p className="mt-1 text-gray-500">Error</p>
          <p className="truncate text-[11px] text-gray-700">{latestTurnAudit?.error || '-'}</p>

          <button
            type="button"
            onClick={onHealthCheck}
            disabled={checkingHealth}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-60"
            style={{ backgroundColor: C.gray800 }}
          >
            {checkingHealth ? t('Diagnostics.checking') : t('Diagnostics.checkHealth')}
          </button>

          <div className="mt-2 text-xs text-gray-600">
            <span className="mr-2">{t('Diagnostics.status')}</span>
            <span className="font-medium">
              {healthStatus === 'healthy'
                ? t('Diagnostics.healthy')
                : healthStatus === 'checking'
                  ? t('Diagnostics.checking')
                  : healthStatus === 'unreachable'
                    ? t('Diagnostics.unreachable')
                    : t('Diagnostics.notChecked')}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
