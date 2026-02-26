import React from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import type {
  ChunkTaskResult,
  QualityGateResult,
  WorldStudioCharacterProfile,
  WorldStudioKnowledgeGraphDraft,
} from '../../contracts.js';
import type { Phase1Result } from '../../generation/pipeline.js';
import { Phase1PreviewGrid } from './phase1/preview-grid.js';
import { Phase1Diagnostics } from './phase1/diagnostics.js';

type Phase1PanelProps = {
  phase1: Phase1Result | null;
  qualityGate: QualityGateResult | null;
  knowledgeGraph: WorldStudioKnowledgeGraphDraft;
  chunkTasks: ChunkTaskResult[];
  expertMode: boolean;
};

function CountCard(props: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{props.label}</div>
      <div className="mt-1 text-lg font-semibold text-gray-900">{props.value}</div>
    </div>
  );
}

function RatioCard(props: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{props.label}</div>
      <div className="mt-1 text-lg font-semibold text-gray-900">{Math.round(props.value * 100)}%</div>
    </div>
  );
}

function gateTagStyle(status: QualityGateResult['status']): string {
  if (status === 'PASS') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'WARN') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-red-200 bg-red-50 text-red-700';
}

function gateLabel(status: QualityGateResult['status']): string {
  if (status === 'PASS') return 'phase1.gate.pass';
  if (status === 'WARN') return 'phase1.gate.warn';
  return 'phase1.gate.block';
}

function renderCharacterProfiles(
  profiles: WorldStudioCharacterProfile[],
  t: (key: string, values?: Record<string, unknown>) => string,
) {
  if (profiles.length === 0) {
    return <p className="mt-2 text-xs text-gray-500">{t('phase1.characterProfilesEmpty')}</p>;
  }
  return (
    <div className="mt-2 grid gap-2 md:grid-cols-2">
      {profiles.slice(0, 12).map((profile) => (
        <div key={profile.name} className="rounded-md border border-gray-200 bg-gray-50 p-2.5">
          <p className="text-xs font-semibold text-gray-900">{profile.name}</p>
          {profile.aliases.length > 0 ? (
            <p className="mt-1 text-[11px] text-gray-600">{t('phase1.characterProfile.aliases')}: {profile.aliases.join(' / ')}</p>
          ) : null}
          <p className="mt-1 text-[11px] text-gray-700">{t('phase1.characterProfile.background')}: {profile.background || '-'}</p>
          <p className="mt-1 text-[11px] text-gray-700">{t('phase1.characterProfile.motivation')}: {profile.motivation || '-'}</p>
          <p className="mt-1 text-[11px] text-gray-700">{t('phase1.characterProfile.relationships')}: {profile.relationships.slice(0, 4).join('；') || '-'}</p>
        </div>
      ))}
    </div>
  );
}

export function Phase1Panel(props: Phase1PanelProps) {
  const { t } = useModTranslation('world-studio');
  const graph = props.phase1?.knowledgeGraph || props.knowledgeGraph;
  const qualityGate = props.phase1?.qualityGate || props.qualityGate;
  const hasData = Boolean(props.phase1)
    || graph.timeline.length > 0
    || graph.characters.length > 0
    || graph.events.primary.length > 0;
  const primaryEvents = graph.events.primary || [];
  const secondaryEvents = graph.events.secondary || [];

  const terminalChunkMap = new Map<number, ChunkTaskResult>();
  props.chunkTasks.forEach((task) => {
    const existing = terminalChunkMap.get(task.chunkIndex);
    if (!existing || task.status === 'success' || existing.status !== 'success') {
      terminalChunkMap.set(task.chunkIndex, task);
    }
  });
  const failedChunkCount = Array.from(terminalChunkMap.values()).filter((item) => item.status === 'failed').length;

  if (!hasData) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-900">{t('phase1.title')}</h3>
        <p className="mt-2 text-xs text-gray-500">
          {t('phase1.empty')}
        </p>
      </section>
    );
  }

  const profiles = (graph.characterProfiles || []).filter((item) => Boolean(item && item.name));
  const narrativeArc = graph.narrativeArc;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-900">{t('phase1.title')}</h3>
      <p className="mt-1 text-xs text-gray-500">{t('phase1.subtitle')}</p>

      <div className="mt-3 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
        <CountCard label={t('phase1.metrics.primaryEvents')} value={primaryEvents.length} />
        <CountCard label={t('phase1.metrics.secondaryEvents')} value={secondaryEvents.length} />
        <CountCard label={t('phase1.metrics.characters')} value={graph.characters.length} />
        <CountCard label={t('phase1.metrics.characterProfiles')} value={profiles.length} />
        <CountCard label={t('phase1.metrics.timeline')} value={graph.timeline.length} />
        <CountCard label={t('phase1.metrics.failedChunks')} value={failedChunkCount} />
      </div>

      {qualityGate ? (
        <div className={`mt-3 rounded-lg border p-3 ${gateTagStyle(qualityGate.status)}`}>
          <p className="text-xs font-semibold">{t('phase1.qualityGate')}: {t(gateLabel(qualityGate.status))}</p>
          <p className="mt-1 text-[11px]">
            {t('phase1.qualityGateSummary', {
              success: qualityGate.metrics.successChunks,
              total: qualityGate.metrics.totalChunks,
              coverage: Math.round(qualityGate.metrics.primaryEvidenceCoverage * 100),
            })}
          </p>
          {qualityGate.issues.length > 0 ? (
            <div className="mt-2 space-y-1">
              {qualityGate.issues.slice(0, 6).map((issue, index) => (
                <p key={`${issue.code}:${index}`} className="text-[11px]">
                  [{issue.severity}] {issue.message}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <div className="text-xs font-semibold text-gray-800">{t('phase1.worldSettingTitle')}</div>
        <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-gray-700">
          {graph.worldSetting || t('phase1.worldSettingEmpty')}
        </p>
      </div>

      <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <div className="text-xs font-semibold text-gray-800">{t('phase1.narrativeArcTitle')}</div>
        {narrativeArc ? (
          <div className="mt-2 space-y-1 text-xs text-gray-700">
            <p><span className="font-semibold text-gray-800">{t('phase1.narrativeArc.summary')}:</span> {narrativeArc.summary || '-'}</p>
            <p><span className="font-semibold text-gray-800">{t('phase1.narrativeArc.opening')}:</span> {narrativeArc.opening || '-'}</p>
            <p><span className="font-semibold text-gray-800">{t('phase1.narrativeArc.development')}:</span> {narrativeArc.development || '-'}</p>
            <p><span className="font-semibold text-gray-800">{t('phase1.narrativeArc.climax')}:</span> {narrativeArc.climax || '-'}</p>
            <p><span className="font-semibold text-gray-800">{t('phase1.narrativeArc.resolution')}:</span> {narrativeArc.resolution || '-'}</p>
          </div>
        ) : (
          <p className="mt-1 text-xs text-gray-500">{t('phase1.narrativeArcEmpty')}</p>
        )}
      </div>

      <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
        <div className="text-xs font-semibold text-gray-800">{t('phase1.characterProfilesTitle')}</div>
        {renderCharacterProfiles(profiles, t)}
      </div>

      {props.expertMode ? (
        <>
          {qualityGate ? (
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              <RatioCard label={t('phase1.ratio.eventCharacter')} value={qualityGate.metrics.eventCharacterCoverage} />
              <RatioCard label={t('phase1.ratio.eventLocation')} value={qualityGate.metrics.eventLocationCoverage} />
              <RatioCard label={t('phase1.ratio.narrativeCompleteness')} value={qualityGate.metrics.primaryNarrativeCompleteness} />
              <RatioCard label={t('phase1.ratio.characterPurity')} value={qualityGate.metrics.characterNamePurity} />
            </div>
          ) : null}
          <Phase1PreviewGrid graph={graph} />
          <Phase1Diagnostics chunkTasks={props.chunkTasks} />
        </>
      ) : null}
    </section>
  );
}
