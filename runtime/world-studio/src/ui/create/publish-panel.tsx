import React from 'react';
import type { WorldStudioCreateStep, WorldStudioParseJobState } from '../../contracts.js';
import { useModTranslation } from "@nimiplatform/sdk/mod";
type PublishPanelProps = {
    step: WorldStudioCreateStep;
    draftId: string;
    hasPhase1: boolean;
    hasPhase2: boolean;
    parseJob: WorldStudioParseJobState;
    selectedAgentSyncCount: number;
    worldCoverStatus: 'idle' | 'queued' | 'running' | 'succeeded' | 'failed';
    working: boolean;
    onSaveDraft: () => void;
    onPublishDraft: () => void;
    embedded?: boolean;
    showTitle?: boolean;
    showActions?: boolean;
};
function StepBadge(props: {
    label: string;
    done: boolean;
}) {
    return (<div className={`ui-sync-pill rounded-md border px-2 py-1 text-[11px] font-medium ${props.done
            ? 'ui-sync-status-success border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-gray-200 bg-gray-50 text-gray-500'}`}>
      {props.label}
    </div>);
}
function parseDone(parseJob: WorldStudioParseJobState): boolean {
    return parseJob.phase === 'done' || parseJob.progress >= 1;
}
export function PublishPanel(props: PublishPanelProps) {
    const { t } = useModTranslation('world-studio');
    const embedded = Boolean(props.embedded);
    const showTitle = props.showTitle !== false;
    const showActions = props.showActions !== false;
    return (<section className={embedded ? '' : 'ui-sync-card ui-sync-card-inset m-3 p-3'}>
      {showTitle ? <h3 className="text-sm font-semibold text-gray-900">{t('publishPanel.title')}</h3> : null}
      <p className={`${showTitle ? 'mt-1 ' : ''}text-xs text-gray-500`}>{t('publishPanel.currentStep', { step: props.step })}</p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <StepBadge label={t('publishPanel.extract')} done={props.hasPhase1 && parseDone(props.parseJob)}/>
        <StepBadge label={t('publishPanel.synthesize')} done={props.hasPhase2}/>
        <StepBadge label={t('publishPanel.draft')} done={Boolean(props.draftId)}/>
        <StepBadge label={t('publishPanel.publish')} done={false}/>
      </div>

      <div className="ui-sync-toolbar mt-3 p-2">
        <p className="text-[11px] text-gray-600">
          {t('publishPanel.parseSummary', {
            phase: props.parseJob.phase,
            completed: props.parseJob.chunkCompleted,
            total: props.parseJob.chunkTotal,
            failed: props.parseJob.chunkFailed,
        })}
        </p>
        <p className="mt-1 text-[11px] text-gray-600">
          {t('publishPanel.agentSyncSelected', { count: props.selectedAgentSyncCount })}
        </p>
        <p className="mt-1 text-[11px] text-gray-600">
          {t('publishPanel.worldCover', { status: props.worldCoverStatus })}
        </p>
      </div>

      {showActions ? (<div className="mt-3 flex flex-col gap-2">
          <button type="button" className="ui-sync-btn ui-sync-btn-primary rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60" onClick={props.onSaveDraft} disabled={props.working || !props.hasPhase2}>
            {props.draftId ? t('publishPanel.updateDraft') : t('publishPanel.createDraft')}
          </button>
          <button type="button" className="ui-sync-btn ui-sync-btn-primary rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60" onClick={props.onPublishDraft} disabled={props.working || !props.draftId}>
            {t('publishPanel.publishDraft')}
          </button>
        </div>) : null}
      {props.draftId ? <p className="mt-2 text-xs text-gray-500">{t('publishPanel.draftId', { draftId: props.draftId })}</p> : null}
    </section>);
}
