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

const CHEVRON_ICON = (
  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 7.5L10 12.5L15 7.5" />
  </svg>
);

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
  const hasRecentMessagesLayer = latestPromptTrace?.appliedLayers?.includes('recentTurns') || false;
  const hasInteractionProfileLayer = latestPromptTrace?.appliedLayers?.includes('interactionProfile') || false;
  const routeValue = `${latestPromptTrace?.routeSource || '-'} / ${latestPromptTrace?.routeModel || '-'}`;
  const plannerValue = latestPromptTrace
    ? `${latestPromptTrace.plannerUsed ? 'on' : 'off'} · ${latestPromptTrace.plannerKind || 'none'} · ${latestPromptTrace.plannerTrigger || 'none'}${typeof latestPromptTrace.plannerConfidence === 'number' ? ` · ${latestPromptTrace.plannerConfidence.toFixed(2)}` : ''}`
    : '-';
  const readinessValue = latestPromptTrace
    ? `image ${latestPromptTrace.imageReady ? 'ready' : 'not-ready'} · video ${latestPromptTrace.videoReady ? 'ready' : 'not-ready'}`
    : '-';
  const dependencyValue = latestPromptTrace
    ? `image ${latestPromptTrace.imageDependencyStatus || '-'} · video ${latestPromptTrace.videoDependencyStatus || '-'}`
    : '-';
  const mediaDecisionValue = latestPromptTrace
    ? `${latestPromptTrace.mediaDecisionSource || 'none'} · ${latestPromptTrace.mediaDecisionKind || 'none'}`
    : '-';
  const mediaExecutionValue = latestPromptTrace
    ? `${latestPromptTrace.mediaExecutionStatus || 'none'} · ${latestPromptTrace.mediaExecutionRouteSource || '-'}${latestPromptTrace.mediaExecutionRouteModel ? ` / ${latestPromptTrace.mediaExecutionRouteModel}` : ''}`
    : '-';
  const continuityValue = latestPromptTrace
    ? `turns ${latestPromptTrace.selectedTurnSeqs.join(', ') || '-'} · recall ${latestPromptTrace.sessionRecallCount}`
    : '-';
  const replyStyleValue = latestPromptTrace?.interactionProfile
    ? `${latestPromptTrace.interactionProfile.expression.responseLength} · ${latestPromptTrace.interactionProfile.expression.formality} · ${latestPromptTrace.interactionProfile.expression.sentiment} · ${latestPromptTrace.interactionProfile.expression.pacingBias}`
    : '-';
  const pacingPlanValue = latestPromptTrace?.pacingPlan
    ? `${latestPromptTrace.pacingPlan.mode} · ${latestPromptTrace.pacingPlan.energy} · max ${latestPromptTrace.pacingPlan.maxSegments}`
    : '-';
  const laneBudgetValue = latestPromptTrace?.laneBudgets
    ? Object.entries(latestPromptTrace.laneBudgets)
      .map(([lane, budget]) => `${lane} ${budget.usedChars}/${budget.maxChars}${budget.truncated ? '!' : ''}`)
      .join(' · ')
    : '-';
  const metricItems = [
    {
      key: 'route',
      label: t('Diagnostics.metricRoute'),
      value: routeValue,
    },
    {
      key: 'prompt-chars',
      label: t('Diagnostics.metricPromptChars'),
      value: String(latestPromptTrace?.promptChars ?? '-'),
    },
    {
      key: 'latency',
      label: t('Diagnostics.metricLatency'),
      value: latestTurnAudit ? `${latestTurnAudit.latencyMs}ms` : '-',
    },
    {
      key: 'stream-deltas',
      label: t('Diagnostics.metricStreamDeltas'),
      value: String(latestPromptTrace?.streamDeltaCount ?? '-'),
    },
    {
      key: 'stream-duration',
      label: t('Diagnostics.metricDuration'),
      value: typeof latestPromptTrace?.streamDurationMs === 'number' ? `${latestPromptTrace.streamDurationMs}ms` : '-',
    },
    {
      key: 'segments',
      label: t('Diagnostics.metricSegments'),
      value: String(latestPromptTrace?.planSegments ?? '-'),
    },
  ];

  return (
    <div className="lc-card rounded-2xl p-3 text-xs">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex h-7 w-full items-center justify-between text-left text-[13px] font-semibold text-gray-700"
      >
        <span>{t('Diagnostics.title')}</span>
        <span className={`text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>{CHEVRON_ICON}</span>
      </button>
      {open ? (
        <div className="mt-3">
          <div className="min-h-0 space-y-3 lc-panel-expand">
          <div className="grid grid-cols-2 gap-2">
            {metricItems.map((item) => (
              <div key={item.key} className="rounded-xl border border-gray-200 bg-white px-2.5 py-2">
                <p className="truncate text-[10px] font-medium uppercase tracking-wide text-gray-400">{item.label}</p>
                <p className="mt-1 truncate text-[12px] font-semibold text-gray-800">{item.value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-2.5">
            <p className="text-[11px] font-semibold text-gray-700">{t('Diagnostics.detailTitle')}</p>
            <div className="mt-1.5 space-y-1 text-[11px] text-gray-600">
              <p>
                <span className="font-medium">{t('Diagnostics.detailCompiler')}:</span>{' '}
                {latestPromptTrace?.compilerVersion || '-'}
              </p>
              <p>
                <span className="font-medium">{t('Diagnostics.detailPromptBudget')}:</span>{' '}
                {latestPromptTrace
                  ? `${latestPromptTrace.budget?.usedChars ?? 0}/${latestPromptTrace.budget?.maxChars ?? 0}${latestPromptTrace.budget?.truncated ? ' (truncated)' : ''}`
                  : '-'}
              </p>
              <p>
                <span className="font-medium">{t('Diagnostics.detailLaneBudgets')}:</span>{' '}
                {laneBudgetValue}
              </p>
              <p>
                <span className="font-medium">{t('Diagnostics.detailDroppedLayers')}:</span>{' '}
                {latestPromptTrace?.droppedLayers?.length
                  ? latestPromptTrace.droppedLayers.join(', ')
                  : '-'}
              </p>
              <p>
                <span className="font-medium">{t('Diagnostics.detailCriticalLayers')}:</span>{' '}
                recentTurns={hasRecentMessagesLayer ? 'yes' : 'no'} · interactionProfile={hasInteractionProfileLayer ? 'yes' : 'no'}
              </p>
              <p>
                <span className="font-medium">{t('Diagnostics.detailMemorySlices')}:</span>{' '}
                {latestPromptTrace
                  ? `core ${latestPromptTrace.memorySlices?.core ?? 0} · e2e ${latestPromptTrace.memorySlices?.e2e ?? 0} · recall ${latestPromptTrace.sessionRecallCount}`
                  : '-'}
              </p>
              <p>
                <span className="font-medium">{t('Diagnostics.detailReplyStyle')}:</span>{' '}
                {replyStyleValue}
              </p>
              <p>
                <span className="font-medium">{t('Diagnostics.detailPacingPlan')}:</span>{' '}
                {pacingPlanValue}
              </p>
              <p>
                <span className="font-medium">continuity:</span>{' '}
                {continuityValue}
              </p>
              <p>
                <span className="font-medium">{t('Diagnostics.detailSegmentParse')}:</span>{' '}
                {latestPromptTrace?.segmentParseMode || '-'}
              </p>
              <p>
                <span className="font-medium">{t('Diagnostics.detailNsfwPolicy')}:</span>{' '}
                {latestPromptTrace?.nsfwPolicy || '-'}
              </p>
              <p>
                <span className="font-medium">{t('Diagnostics.detailPlanner')}:</span>{' '}
                {plannerValue}
              </p>
              <p>
                <span className="font-medium">{t('Diagnostics.detailPlannerBlockedReason')}:</span>{' '}
                {latestPromptTrace?.plannerBlockedReason || '-'}
              </p>
              <p>
                <span className="font-medium">{t('Diagnostics.detailMediaReadiness')}:</span>{' '}
                {readinessValue}
              </p>
              <p>
                <span className="font-medium">{t('Diagnostics.detailMediaDependencies')}:</span>{' '}
                {dependencyValue}
              </p>
              <p>
                <span className="font-medium">{t('Diagnostics.detailMediaDecision')}:</span>{' '}
                {mediaDecisionValue}
              </p>
              <p>
                <span className="font-medium">{t('Diagnostics.detailMediaExecution')}:</span>{' '}
                {mediaExecutionValue}
              </p>
              <p>
                <span className="font-medium">{t('Diagnostics.detailMediaExecutionReason')}:</span>{' '}
                {latestPromptTrace?.mediaExecutionReason || '-'}
              </p>
              <p className="truncate">
                <span className="font-medium">{t('Diagnostics.detailError')}:</span>{' '}
                {latestTurnAudit?.error || '-'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onHealthCheck}
            disabled={checkingHealth}
            className="lc-btn lc-btn-secondary flex h-10 w-full items-center gap-2 px-4 text-sm font-semibold disabled:opacity-60"
          >
            {checkingHealth ? t('Diagnostics.checking') : t('Diagnostics.checkHealth')}
          </button>

          <div className="text-xs text-gray-600">
            <span className="mr-2">{t('Diagnostics.status')}</span>
            <span className="font-semibold">
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
        </div>
      ) : null}
    </div>
  );
}
