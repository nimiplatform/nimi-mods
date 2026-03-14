import React from 'react';
import type { Phase1Result } from '../../generation/pipeline.js';
import type { EventNodeDraft } from '../../contracts.js';
import { countPrimaryEventsMissingEvidence } from '../../services/event-horizon.js';
import { EventGraphEditor } from './event-graph-editor.js';
import { Phase1PreviewGrid } from './phase1/preview-grid.js';
import { Phase1Diagnostics } from './phase1/diagnostics.js';
import { useModTranslation } from "@nimiplatform/sdk/mod";

type CheckpointsPanelProps = {
  phase1: Phase1Result | null;
  sourceText: string;
  selectedStartTimeId: string;
  selectedCharacters: string[];
  events: {
    primary: EventNodeDraft[];
    secondary: EventNodeDraft[];
  };
  eventGraphLayout?: {
    selectedEventId: string;
    expandedPrimaryIds: string[];
  };
  onSelectStartTimeId: (id: string) => void;
  onToggleCharacter: (name: string, checked: boolean) => void;
  onEventsChange: (next: {
    primary: EventNodeDraft[];
    secondary: EventNodeDraft[];
  }) => void;
  onEventGraphLayoutChange?: (next: {
    selectedEventId: string;
    expandedPrimaryIds: string[];
  }) => void;
  onRefreshQualityGate: () => void;
  onRunPhase2: () => void;
  showInlineActions?: boolean;
  working: boolean;
};

function CountCard(props: { label: string; value: number }) {
  return (
    <div className="ui-sync-metric-card px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{props.label}</div>
      <div className="mt-1 text-lg font-semibold text-gray-900">{props.value}</div>
    </div>
  );
}

function RatioCard(props: { label: string; value: number }) {
  return (
    <div className="ui-sync-metric-card px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{props.label}</div>
      <div className="mt-1 text-lg font-semibold text-gray-900">{Math.round(props.value * 100)}%</div>
    </div>
  );
}

export function CheckpointsPanel(props: CheckpointsPanelProps) {
  const { t } = useModTranslation('world-studio');
  const showInlineActions = props.showInlineActions !== false;
  if (!props.phase1) {
    return (
      <section className="ui-sync-card ui-sync-card-inset p-4">
        <h3 className="text-sm font-semibold text-gray-900">{t('checkpoints.title')}</h3>
        <p className="mt-2 text-xs text-gray-500">{t('checkpoints.empty')}</p>
      </section>
    );
  }
  const graph = props.phase1.knowledgeGraph;
  const qualityGate = props.phase1.qualityGate;
  const primaryMissingEvidence = countPrimaryEventsMissingEvidence(props.events.primary);
  const canRunSynthesize = !props.working
    && Boolean(props.selectedStartTimeId)
    && props.selectedCharacters.length > 0
    && props.events.primary.length > 0
    && primaryMissingEvidence === 0;
  const profiles = (graph.characterProfiles || []).filter((item) => Boolean(item && item.name));
  const narrativeArc = graph.narrativeArc;

  return (
    <div className="space-y-4">
      <details className="ui-sync-card ui-sync-card-inset p-4" open>
        <summary className="cursor-pointer text-sm font-semibold text-gray-900">
          Phase1 Overview
        </summary>
        <p className="mt-1 text-xs text-gray-500">
          Extraction statistics, gate diagnostics, world-setting summary, narrative arc, and character profiles now live inside CURATE.
        </p>

        <div className="mt-3 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
          <CountCard label={t('phase1.metrics.primaryEvents')} value={graph.events.primary.length} />
          <CountCard label={t('phase1.metrics.secondaryEvents')} value={graph.events.secondary.length} />
          <CountCard label={t('phase1.metrics.characters')} value={graph.characters.length} />
          <CountCard label={t('phase1.metrics.characterProfiles')} value={profiles.length} />
          <CountCard label={t('phase1.metrics.timeline')} value={graph.timeline.length} />
          <CountCard label={t('phase1.metrics.failedChunks')} value={props.phase1.chunkTasks.filter((item) => item.status === 'failed').length} />
        </div>

        <div className={`mt-3 rounded-lg border p-3 ${
          qualityGate.status === 'PASS'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : qualityGate.status === 'WARN'
              ? 'border-amber-200 bg-amber-50 text-amber-700'
              : 'border-red-200 bg-red-50 text-red-700'
        }`}>
          <p className="text-xs font-semibold">Quality Gate: {qualityGate.status}</p>
          <p className="mt-1 text-[11px]">
            success {qualityGate.metrics.successChunks}/{qualityGate.metrics.totalChunks}
            {' · '}
            evidence {Math.round(qualityGate.metrics.primaryEvidenceCoverage * 100)}%
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

        <div className="ui-sync-soft-card mt-3 p-3">
          <div className="text-xs font-semibold text-gray-800">{t('phase1.worldSettingTitle')}</div>
          <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-gray-700">
            {graph.worldSetting || t('phase1.worldSettingEmpty')}
          </p>
        </div>

        <div className="ui-sync-soft-card mt-3 p-3">
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

        <div className="ui-sync-card mt-3 p-3">
          <div className="text-xs font-semibold text-gray-800">{t('phase1.characterProfilesTitle')}</div>
          {profiles.length === 0 ? (
            <p className="mt-2 text-xs text-gray-500">{t('phase1.characterProfilesEmpty')}</p>
          ) : (
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {profiles.slice(0, 12).map((profile) => (
                <div key={profile.name} className="ui-sync-soft-card p-2.5">
                  <p className="text-xs font-semibold text-gray-900">{profile.name}</p>
                  {profile.aliases.length > 0 ? (
                    <p className="mt-1 text-[11px] text-gray-600">{t('phase1.characterProfile.aliases')}: {profile.aliases.join(' / ')}</p>
                  ) : null}
                  <p className="mt-1 text-[11px] text-gray-700">{t('phase1.characterProfile.background')}: {profile.background || '-'}</p>
                  <p className="mt-1 text-[11px] text-gray-700">{t('phase1.characterProfile.motivation')}: {profile.motivation || '-'}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <RatioCard label={t('phase1.ratio.eventCharacter')} value={qualityGate.metrics.eventCharacterCoverage} />
          <RatioCard label={t('phase1.ratio.eventLocation')} value={qualityGate.metrics.eventLocationCoverage} />
          <RatioCard label={t('phase1.ratio.narrativeCompleteness')} value={qualityGate.metrics.primaryNarrativeCompleteness} />
          <RatioCard label={t('phase1.ratio.characterPurity')} value={qualityGate.metrics.characterNamePurity} />
        </div>

        <Phase1PreviewGrid graph={graph} />
        <Phase1Diagnostics chunkTasks={props.phase1.chunkTasks} />
      </details>

      <section className="ui-sync-card ui-sync-card-inset p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-semibold text-gray-900">{t('checkpoints.title')}</h3>
          {showInlineActions ? (
            <button type="button" className="ui-sync-btn ui-sync-btn-secondary rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 disabled:opacity-60" onClick={props.onRefreshQualityGate} disabled={props.working}>
              {t('checkpoints.refreshQualityGate')}
            </button>
          ) : null}
        </div>
        <div className="mt-3">
          <label className="text-xs font-medium text-gray-700">{t('checkpoints.startTime')}</label>
          <select className="mt-1 h-9 w-full rounded-md border border-gray-300 px-2 text-xs" value={props.selectedStartTimeId} onChange={(event) => props.onSelectStartTimeId(event.target.value)}>
            {props.phase1.startTimeOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3">
          <label className="text-xs font-medium text-gray-700">{t('checkpoints.characterSelection')}</label>
          <div className="ui-sync-soft-card mt-1 max-h-56 overflow-auto p-2">
            {props.phase1.characterCandidates.map((item) => {
              const checked = props.selectedCharacters.includes(item.name);
              return (
                <label key={item.name} className="mb-1 flex items-center gap-2 text-xs text-gray-800">
                  <input type="checkbox" checked={checked} onChange={(event) => props.onToggleCharacter(item.name, event.target.checked)} />
                  <span>{item.name}</span>
                </label>
              );
            })}
          </div>
        </div>
      </section>

      <EventGraphEditor title={t('checkpoints.eventGraphEditor')} events={props.events} sourceContextText={props.sourceText} onChange={props.onEventsChange} layout={props.eventGraphLayout} onLayoutChange={props.onEventGraphLayoutChange} />

      <section className="ui-sync-card ui-sync-card-inset p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{t('checkpoints.runSynthesis')}</h3>
            <p className="mt-1 text-xs text-gray-600">
              {t('checkpoints.runSynthesisHint')}
            </p>
          </div>
          {showInlineActions ? (
            <button type="button" className="ui-sync-btn ui-sync-btn-primary rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60" onClick={props.onRunPhase2} disabled={!canRunSynthesize}>
              {t('checkpoints.runSynthesis')}
            </button>
          ) : null}
        </div>
        {primaryMissingEvidence > 0 ? (
          <p className="ui-sync-alert ui-sync-alert-danger mt-2 px-2 py-1 text-xs text-red-700">
            {t('checkpoints.primaryMissingEvidence', { count: primaryMissingEvidence })}
          </p>
        ) : null}
        {props.events.primary.length === 0 ? (
          <p className="ui-sync-alert ui-sync-alert-danger mt-2 px-2 py-1 text-xs text-red-700">
            {t('checkpoints.primaryRequired')}
          </p>
        ) : null}
      </section>
    </div>
  );
}
