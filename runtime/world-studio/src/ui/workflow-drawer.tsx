import React from 'react';
import { WorkspacePanel } from '../components/workspace-panel.js';
import { CreateStageNav } from './create/create-stage-nav.js';
import { MaintainSectionNav } from './maintain/maintain-section-nav.js';
import type {
  WorldStudioActionsSlice,
  WorldStudioWorkflowSlice,
} from '../controllers/world-studio-screen-model.js';
import { worldStudioMessage } from '../i18n/messages.js';

export function WorkflowDrawer(props: {
  workflow: WorldStudioWorkflowSlice;
  actions: WorldStudioActionsSlice;
}): React.ReactElement {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2.5">
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
                : worldStudioMessage('workflow.sectionNavTitle', 'Sections')}
            </p>
            <p className="mt-1 text-[12px] leading-5 text-slate-500">
              {props.workflow.landingTarget === 'CREATE'
                ? worldStudioMessage('workflow.stageNavDescription', 'Jump between the major creation stages.')
                : worldStudioMessage('workflow.sectionNavDescription', 'Jump between the major maintenance editors.')}
            </p>
          </div>
          {props.workflow.landingTarget === 'CREATE' ? (
            <CreateStageNav
              activeStage={props.workflow.createDisplayStage}
              stageAccess={props.workflow.createStageAccess}
              onSelectStage={props.actions.workflow.selectCreateDisplayStage}
            />
          ) : (
            <MaintainSectionNav
              activeSection={props.workflow.maintainSection}
              onSelectSection={props.actions.workflow.selectMaintainSection}
            />
          )}
        </section>
      </div>
    </div>
  );
}
