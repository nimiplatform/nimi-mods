import React from 'react';
import { WorkspacePanel } from '../components/workspace-panel.js';
import { CreateStageNav } from './create/create-stage-nav.js';
import { DomainNav } from './maintain/domain-nav.js';
import type {
  WorldStudioActionsSlice,
  WorldStudioLayoutSlice,
  WorldStudioMainSlice,
  WorldStudioRoutingSlice,
  WorldStudioStatusSlice,
  WorldStudioWorkflowSlice,
} from '../controllers/world-studio-screen-model.js';
import { worldStudioMessage } from '../i18n/messages.js';

export function WorkflowDrawer(props: {
  layout: WorldStudioLayoutSlice;
  workflow: WorldStudioWorkflowSlice;
  main: WorldStudioMainSlice;
  routing: WorldStudioRoutingSlice;
  status: WorldStudioStatusSlice;
  actions: WorldStudioActionsSlice;
}): React.ReactElement {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-2.5">
        <WorkspacePanel
          worlds={props.workflow.worlds}
          drafts={props.workflow.drafts}
          primaryWorld={props.workflow.primaryWorld}
          latestDraft={props.workflow.latestDraft}
          selectedWorldId={props.workflow.selectedWorldId}
          selectedDraftId={props.workflow.selectedDraftId}
          onRefresh={() => {
            void props.actions.workflow.refreshWorkspace();
          }}
          onOpenMaintenance={props.actions.workflow.openMaintenance}
          onOpenCreate={props.actions.workflow.openCreate}
        />

        <section className="rounded-[20px] border border-white/80 bg-white/90 p-3 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
          <div className="mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              {props.workflow.landingTarget === 'CREATE'
                ? worldStudioMessage('workflow.stageNavTitle', 'Workflow')
                : worldStudioMessage('workflow.domainNavTitle', 'Maintenance Domains')}
            </p>
            <p className="mt-1 text-[12px] leading-5 text-slate-500">
              {props.workflow.landingTarget === 'CREATE'
                ? worldStudioMessage('workflow.stageNavDescription', 'Jump between the major creation stages.')
                : worldStudioMessage('workflow.domainNavDescription', 'Switch between world, agent, asset, and release maintenance views.')}
            </p>
          </div>
          {props.workflow.landingTarget === 'CREATE' ? (
            <CreateStageNav
              activeStage={props.workflow.createDisplayStage}
              stageAccess={props.workflow.createStageAccess}
              onSelectStage={props.actions.workflow.selectCreateDisplayStage}
            />
          ) : (
            <DomainNav
              activeDomain={props.workflow.activeDomain}
              onSelectDomain={props.actions.workflow.selectMaintainDomain}
            />
          )}
        </section>

        <section className="rounded-[20px] border border-white/80 bg-white/90 p-3 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            {worldStudioMessage('statusSummary.title', 'Status Summary')}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-[#eef5f5] px-3 py-2 text-xs text-slate-700">
              <p className="font-semibold">{props.layout.dirtySummary.shortLabel}</p>
              <p className="mt-1">{worldStudioMessage('statusSummary.dirtySections', 'Dirty sections')}</p>
            </div>
            <div className="rounded-2xl bg-[#eef5f5] px-3 py-2 text-xs text-slate-700">
              <p className="font-semibold">{props.status.primaryEventCount}/{props.status.secondaryEventCount}</p>
              <p className="mt-1">{worldStudioMessage('statusSummary.primarySecondary', 'Primary / Secondary')}</p>
            </div>
            <div className="rounded-2xl bg-[#eef5f5] px-3 py-2 text-xs text-slate-700">
              <p className="font-semibold">{props.status.storyProjectionCount}</p>
              <p className="mt-1">{worldStudioMessage('statusSummary.storyProjections', 'Story projections')}</p>
            </div>
            <div className="rounded-2xl bg-[#eef5f5] px-3 py-2 text-xs text-slate-700">
              <p className="font-semibold">{props.status.mutations.length}</p>
              <p className="mt-1">{worldStudioMessage('statusSummary.mutations', 'Mutations')}</p>
            </div>
          </div>
          {props.status.notice ? (
            <p className="mt-3 text-xs text-emerald-700">{props.status.notice}</p>
          ) : null}
          {props.status.error ? (
            <p className="mt-2 text-xs text-red-700">{props.status.error}</p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
