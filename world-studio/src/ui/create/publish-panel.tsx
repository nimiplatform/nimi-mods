import React from 'react';
import type { WorldStudioCreateStep, WorldStudioParseJobState } from '../../contracts.js';

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
};

function StepBadge(props: { label: string; done: boolean }) {
  return (
    <div
      className={`rounded-md border px-2 py-1 text-[11px] font-medium ${
        props.done
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-gray-200 bg-gray-50 text-gray-500'
      }`}
    >
      {props.label}
    </div>
  );
}

function parseDone(parseJob: WorldStudioParseJobState): boolean {
  return parseJob.phase === 'done' || parseJob.progress >= 1;
}

export function PublishPanel(props: PublishPanelProps) {
  const embedded = Boolean(props.embedded);
  const showTitle = props.showTitle !== false;
  return (
    <section className={embedded ? '' : 'm-3 rounded-xl border border-gray-200 bg-white p-3'}>
      {showTitle ? <h3 className="text-sm font-semibold text-gray-900">Create Actions</h3> : null}
      <p className={`${showTitle ? 'mt-1 ' : ''}text-xs text-gray-500`}>Current Step: {props.step}</p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <StepBadge label="EXTRACT" done={props.hasPhase1 && parseDone(props.parseJob)} />
        <StepBadge label="SYNTHESIZE" done={props.hasPhase2} />
        <StepBadge label="DRAFT" done={Boolean(props.draftId)} />
        <StepBadge label="PUBLISH" done={false} />
      </div>

      <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-2">
        <p className="text-[11px] text-gray-600">
          Parse: {props.parseJob.phase} · {props.parseJob.chunkCompleted}/{props.parseJob.chunkTotal} chunks · failed {props.parseJob.chunkFailed}
        </p>
        <p className="mt-1 text-[11px] text-gray-600">
          Agent Sync Selected: {props.selectedAgentSyncCount}
        </p>
        <p className="mt-1 text-[11px] text-gray-600">
          World Cover: {props.worldCoverStatus}
        </p>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <button
          type="button"
          className="rounded-md bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          onClick={props.onSaveDraft}
          disabled={props.working || !props.hasPhase2}
        >
          {props.draftId ? 'Update Draft' : 'Create Draft'}
        </button>
        <button
          type="button"
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          onClick={props.onPublishDraft}
          disabled={props.working || !props.draftId}
        >
          Publish Draft
        </button>
      </div>
      {props.draftId ? <p className="mt-2 text-xs text-gray-500">draftId: {props.draftId}</p> : null}
    </section>
  );
}
