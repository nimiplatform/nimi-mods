import React from 'react';
import { WorldBasePanel } from './world-base-panel.js';
import { WorldviewPanel } from './worldview-panel.js';
import { EventsPanel } from './events-panel.js';
import { LorebooksPanel } from './lorebooks-panel.js';
import { AgentsRegistryPanel } from './agents-panel.js';
import { WorldAssetsPanel, AgentAssetsPanel } from './assets-panel.js';
import { ReleaseDraftsPanel, ReleaseHistoryPanel, ReleasePublishPanel } from './releases-panel.js';
import { SectionNav } from './section-nav.js';
import { StickyActionBar } from '../sticky-action-bar.js';
import type {
  WorldStudioActionsSlice,
  WorldStudioLayoutSlice,
  WorldStudioMainSlice,
  WorldStudioStatusSlice,
  WorldStudioWorkflowSlice,
} from '../../controllers/world-studio-screen-model.js';
import { worldStudioMessage } from '../../i18n/messages.js';
import { useModTranslation } from "@nimiplatform/sdk/mod";

type MaintainWorkbenchProps = {
  layout: WorldStudioLayoutSlice;
  workflow: WorldStudioWorkflowSlice;
  main: WorldStudioMainSlice;
  status: WorldStudioStatusSlice;
  actions: WorldStudioActionsSlice;
};

function ConflictBanner(props: {
  status: WorldStudioStatusSlice;
  actions: WorldStudioActionsSlice['maintain'];
  working: boolean;
}): React.ReactElement | null {
  const { t } = useModTranslation('world-studio');
  if (!props.status.hasMaintenanceConflict) {
    return null;
  }
  return (
    <div className="rounded-[24px] border border-amber-200 bg-amber-50/92 p-4 text-amber-900 shadow-[0_10px_24px_rgba(245,158,11,0.12)]">
      <p className="text-sm font-semibold">{t('maintain.conflictTitle', 'Remote maintenance conflict')}</p>
      <p className="mt-1 text-xs">
        {t('maintain.conflictBody', 'The remote world changed after this snapshot was loaded. Resolve the conflict before trusting local edits.')}
      </p>
      <p className="mt-2 text-xs">
        {t('maintain.conflictSnapshot', 'Remote snapshot: {{value}}', {
          value: props.status.maintenanceEditorSnapshotVersion || '-',
        })}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900"
          onClick={() => {
            void props.actions.reloadFromRemote();
          }}
        >
          {t('maintain.reloadFromRemoteSnapshot', 'Reload From Remote Snapshot')}
        </button>
        <button
          type="button"
          className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900"
          onClick={props.actions.adoptRemoteSnapshot}
        >
          {t('maintain.adoptRemoteSnapshot', 'Adopt Remote Snapshot')}
        </button>
        <button
          type="button"
          className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-60"
          onClick={() => {
            void props.actions.syncToRemote({ force: true });
          }}
          disabled={props.working}
        >
          {t('maintain.forceSyncToRemote', 'Force Sync To Remote')}
        </button>
      </div>
    </div>
  );
}

function MaintainObjectHeader(props: MaintainWorkbenchProps): React.ReactElement {
  const { t } = useModTranslation('world-studio');
  const worldName = String(props.main.snapshot.worldPatch.name || '').trim();
  const missingEvidenceCount = props.status.missingPrimaryEvidenceCount;
  const localSavedAtLabel = (() => {
    if (!props.status.localWorkspaceSavedAt) {
      return t('maintain.localWorkspaceAutoSaved', 'Local workspace auto-save is enabled.');
    }
    const timestamp = new Date(props.status.localWorkspaceSavedAt);
    if (Number.isNaN(timestamp.getTime())) {
      return t('maintain.localWorkspaceSaved', 'Local workspace saved.');
    }
    return t('maintain.localWorkspaceSavedAt', 'Local workspace saved at {{value}}.', {
      value: timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });
  })();
  const remoteSyncLabel = props.layout.dirtySummary.hasDirty
    ? t('maintain.remoteSyncPending', 'These sections still need remote sync: {{value}}', {
        value: props.layout.dirtySummary.labels.join(', '),
      })
    : t('maintain.remoteSyncClean', 'Current edits are synced to the remote snapshot.');
  return (
    <section className="rounded-[28px] border border-white/80 bg-white/88 p-5 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            {t('maintain.headerLabel', 'Maintenance')}
          </p>
          <h3 className="mt-1 text-lg font-semibold text-gray-900">
            {worldName || props.workflow.selectedWorldId || t('maintain.untitledWorld', 'Untitled world')}
          </h3>
          <p className="mt-2 text-xs text-slate-500">
            {t('maintain.headerDescription', 'You are currently editing this world. The information below shows the current snapshot, local edit state, and key world stats.')}
          </p>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-600">
            <span>{t('maintain.worldId', 'World ID: {{value}}', { value: props.workflow.selectedWorldId || '-' })}</span>
            <span>{t('maintain.snapshotVersion', 'Snapshot: {{value}}', { value: props.status.maintenanceEditorSnapshotVersion || '-' })}</span>
          </div>
        </div>
        <div className="rounded-full border border-white/80 bg-[#eef5f5] px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
          {props.layout.dirtySummary.shortLabel}
        </div>
      </div>
      <div className="mt-3 space-y-2">
        <p className="text-xs text-slate-600">
          <span className="font-semibold text-slate-700">
            {t('maintain.localWorkspaceStatusLabel', 'Local Workspace')}:
          </span>{' '}
          {localSavedAtLabel}
        </p>
        <p className={`text-xs ${props.layout.dirtySummary.hasDirty ? 'text-amber-700' : 'text-emerald-700'}`}>
          <span className="font-semibold">
            {t('maintain.remoteSyncStatusLabel', 'Remote Sync')}:
          </span>{' '}
          {remoteSyncLabel}
        </p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-full bg-[#eef5f5] px-3 py-1 text-xs font-medium text-slate-600">
          {t('studioStatus.primary', 'Primary')} {props.status.primaryEventCount}
        </span>
        <span className="rounded-full bg-[#eef5f5] px-3 py-1 text-xs font-medium text-slate-600">
          {t('studioStatus.secondary', 'Secondary')} {props.status.secondaryEventCount}
        </span>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            missingEvidenceCount > 0
              ? 'bg-[#fff4e8] text-amber-700'
              : 'bg-[#eef5f5] text-slate-600'
          }`}
        >
          {t('studioStatus.missingPrimaryEvidence', 'Missing evidence')} {missingEvidenceCount}
        </span>
      </div>
    </section>
  );
}

function SectionContextCard(props: {
  workflow: WorldStudioWorkflowSlice;
}): React.ReactElement {
  const section = props.workflow.activeDomain === 'AGENTS' && props.workflow.activeSection === 'EDITOR'
    ? 'REGISTRY'
    : props.workflow.activeSection;
  const sectionCopy: Record<string, { title: string; description: string; summary: string }> = {
    BASE: {
      title: worldStudioMessage('maintain.section.baseTitle', 'World identity'),
      description: worldStudioMessage('maintain.section.baseDescription', 'Keep the canonical world card readable and publication-ready.'),
      summary: worldStudioMessage('maintain.section.baseSummary', 'Edit the world name, layered copy, classification, and descriptive context in one place.'),
    },
    WORLDVIEW: {
      title: worldStudioMessage('maintain.section.worldviewTitle', 'Worldview Guide'),
      description: worldStudioMessage('maintain.section.worldviewDescription', 'Maintain how the world works, how it is structured, and how creators should reason about it.'),
      summary: worldStudioMessage('maintain.section.worldviewSummary', 'Start from the module overview, then drill down into the entries that need editing.'),
    },
    WORLD_EVENTS: {
      title: worldStudioMessage('maintain.section.eventsTitle', 'World timeline'),
      description: worldStudioMessage('maintain.section.eventsDescription', 'Curate the published event graph that downstream systems will treat as canonical world sequence.'),
      summary: worldStudioMessage('maintain.section.eventsSummary', 'Review graph shape, evidence expectations, and sync mode before writing timeline truth.'),
    },
    LOREBOOKS: {
      title: worldStudioMessage('maintain.section.lorebooksTitle', 'Knowledge surface'),
      description: worldStudioMessage('maintain.section.lorebooksDescription', 'Keep lore entries coherent, queryable, and ready for sync.'),
      summary: worldStudioMessage('maintain.section.lorebooksSummary', 'Add and curate reusable lore rows, then sync them once the set is valid.'),
    },
    REGISTRY: {
      title: worldStudioMessage('maintain.section.registryTitle', 'Agent roster'),
      description: worldStudioMessage('maintain.section.registryDescription', 'Start from the roster, inspect one agent at a time, and enter focused metadata editing only when that specific agent needs work.'),
      summary: worldStudioMessage('maintain.section.registrySummary', 'This page should stay roster-first: scan the world-owned agents, inspect one, then enter focused editing for that agent only when needed.'),
    },
    EDITOR: {
      title: worldStudioMessage('maintain.section.editorTitle', 'Focused agent metadata'),
      description: worldStudioMessage('maintain.section.editorDescription', 'This focused editor belongs to the currently selected agent only. Inspect its truth, watch runtime signal, and edit the metadata fields that are currently writable.'),
      summary: worldStudioMessage('maintain.section.editorSummary', 'Full persona editing remains future-facing; this view is a focused editor for one agent, not a top-level mode for the whole roster.'),
    },
    WORLD_ASSETS: {
      title: worldStudioMessage('maintain.section.worldAssetsTitle', 'World asset coverage'),
      description: worldStudioMessage('maintain.section.worldAssetsDescription', 'Compare generated assets, synced bindings, and missing world asset coverage.'),
      summary: worldStudioMessage('maintain.section.worldAssetsSummary', 'The next step should be obvious: generate, sync, or verify.'),
    },
    AGENT_ASSETS: {
      title: worldStudioMessage('maintain.section.agentAssetsTitle', 'Agent asset coverage'),
      description: worldStudioMessage('maintain.section.agentAssetsDescription', 'Review which portraits already map to remote agents and which still need linkage.'),
      summary: worldStudioMessage('maintain.section.agentAssetsSummary', 'Use this section to close the gap between local portraits and remote agent bindings.'),
    },
    DRAFTS: {
      title: worldStudioMessage('maintain.section.draftsTitle', 'Draft release prep'),
      description: worldStudioMessage('maintain.section.draftsDescription', 'Track which drafts exist, which one is active, and where to jump back into the create flow.'),
      summary: worldStudioMessage('maintain.section.draftsSummary', 'Releases should feel like a release surface, not a hidden transport panel.'),
    },
    PUBLISH: {
      title: worldStudioMessage('maintain.section.publishTitle', 'Publish review handoff'),
      description: worldStudioMessage('maintain.section.publishDescription', 'Use the current maintenance state to decide when it is safe to jump back into publish review.'),
      summary: worldStudioMessage('maintain.section.publishSummary', 'This section should answer whether the draft is ready to leave maintenance and re-enter publish flow.'),
    },
    HISTORY: {
      title: worldStudioMessage('maintain.section.historyTitle', 'Release history'),
      description: worldStudioMessage('maintain.section.historyDescription', 'Read mutation history as a release timeline instead of a hidden technical log.'),
      summary: worldStudioMessage('maintain.section.historySummary', 'What changed, where it changed, and when it changed should all be easy to scan.'),
    },
  };
  const active = sectionCopy[section] ?? {
    title: worldStudioMessage('maintain.section.baseTitle', 'World identity'),
    description: worldStudioMessage('maintain.section.baseDescription', 'Keep the canonical world card readable and publication-ready.'),
    summary: worldStudioMessage('maintain.section.baseSummary', 'Edit the world name, layered copy, classification, and descriptive context in one place.'),
  };
  return (
    <section className="rounded-[24px] border border-white/80 bg-white/88 p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
        {worldStudioMessage('maintain.section.label', 'Section Context')}
      </p>
      <h3 className="mt-2 text-sm font-semibold text-slate-900">{active.title}</h3>
      <p className="mt-1 text-xs text-slate-500">{active.description}</p>
      <p className="mt-3 text-xs text-slate-600">{active.summary}</p>
    </section>
  );
}

function renderContextualActionBar(props: MaintainWorkbenchProps): React.ReactElement {
  const disabled = props.main.working || !props.workflow.selectedWorldId;
  return (
    <>
      <button
        type="button"
        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 disabled:opacity-60"
        onClick={() => {
          void props.actions.maintain.saveLocalWorkspace();
        }}
        disabled={disabled}
      >
        {worldStudioMessage('maintain.saveLocal', 'Save Local')}
      </button>
      <button
        type="button"
        className="ui-sync-btn ui-sync-btn-primary rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
        onClick={() => {
          void props.actions.maintain.syncWorkspaceToRemote();
        }}
        disabled={disabled}
      >
        {worldStudioMessage('maintain.syncToRemote', 'Sync To Remote')}
      </button>
      <button
        type="button"
        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 disabled:opacity-60"
        onClick={() => {
          void props.actions.maintain.reloadFromRemote();
        }}
        disabled={disabled}
      >
        {worldStudioMessage('maintain.reloadFromRemote', 'Reload From Remote')}
      </button>
    </>
  );
}

function renderMaintainSection(props: MaintainWorkbenchProps): React.ReactElement | null {
  const section = props.workflow.activeDomain === 'AGENTS' && props.workflow.activeSection === 'EDITOR'
    ? 'REGISTRY'
    : props.workflow.activeSection;
  if (section === 'BASE') {
    return (
      <WorldBasePanel
        worldPatch={props.main.snapshot.worldPatch}
        onWorldPatchChange={props.actions.maintain.onWorldPatchChange}
      />
    );
  }
  if (section === 'WORLDVIEW') {
    return (
      <WorldviewPanel
        worldviewPatch={props.main.snapshot.worldviewPatch}
        onWorldviewPatchChange={props.actions.maintain.onWorldviewPatchChange}
      />
    );
  }
  if (section === 'WORLD_EVENTS') {
    return (
      <EventsPanel
        events={props.main.eventsGraph}
        syncMode={props.main.eventSyncMode}
        editorSnapshotVersion={props.status.maintenanceEditorSnapshotVersion}
        eventGraphLayout={props.main.snapshot.eventGraphLayout}
        working={props.main.working}
        onEventsChange={props.actions.maintain.onEventsChange}
        onEventGraphLayoutChange={props.actions.maintain.onEventGraphLayoutChange}
        onSyncModeChange={props.actions.maintain.onEventSyncModeChange}
        onSyncEvents={() => {
          void props.actions.maintain.syncEvents();
        }}
        onDeleteFirstEvent={() => {
          void props.actions.maintain.deleteFirstEvent();
        }}
        showActions={false}
      />
    );
  }
  if (section === 'LOREBOOKS') {
    return (
      <LorebooksPanel
        lorebooksDraft={props.main.snapshot.lorebooksDraft}
        working={props.main.working}
        onLorebooksChange={props.actions.maintain.onLorebooksChange}
        onSyncLorebooks={() => {
          void props.actions.maintain.syncLorebooks();
        }}
        showActions={false}
      />
    );
  }
  if (section === 'REGISTRY') {
    const draftCharacterNames = Array.from(new Set([
      ...props.main.snapshot.selectedCharacters,
      ...props.main.snapshot.agentSync.selectedCharacterIds,
      ...Object.keys(props.main.snapshot.agentSync.draftsByCharacter || {}),
    ]));
    const currentWorld = props.workflow.worlds.find((world) => world.id === props.workflow.selectedWorldId) || null;
    return (
      <AgentsRegistryPanel
        world={currentWorld}
        creatorAgents={props.main.creatorAgents}
        selectedAgent={props.main.selectedCreatorAgent}
        selectedAgentId={props.workflow.selectedAgentId}
        draftCharacterNames={draftCharacterNames}
        draftsByCharacter={props.main.snapshot.agentSync.draftsByCharacter}
        working={props.main.working}
        onSelectAgent={props.actions.workflow.selectMaintainAgent}
        onCreateAgentsFromDrafts={(characterNames) => {
          void props.actions.maintain.createAgentsFromDrafts(characterNames);
        }}
        onSaveAgentMetadata={(agentId, patch) => props.actions.maintain.updateCreatorAgentMetadata(agentId, patch)}
        onDirtyChange={(dirty) => props.actions.maintain.setSectionDirty('agentEditor', dirty)}
      />
    );
  }
  if (section === 'WORLD_ASSETS') {
    return (
      <WorldAssetsPanel
        resourceBindings={props.main.resourceBindings}
        worldCoverUrl={typeof props.main.snapshot.assets.worldCover.imageUrl === 'string'
          ? props.main.snapshot.assets.worldCover.imageUrl
          : null}
        locationImages={props.main.snapshot.assets.locationImages}
      />
    );
  }
  if (section === 'AGENT_ASSETS') {
    return (
      <AgentAssetsPanel
        resourceBindings={props.main.resourceBindings}
        creatorAgents={props.main.creatorAgents}
        portraits={props.main.snapshot.assets.characterPortraits}
        draftsByCharacter={props.main.snapshot.agentSync.draftsByCharacter}
        worldId={props.workflow.selectedWorldId}
      />
    );
  }
  if (section === 'DRAFTS') {
    return (
      <ReleaseDraftsPanel
        drafts={props.workflow.drafts}
        selectedDraftId={props.workflow.selectedDraftId}
        onOpenCreate={props.actions.workflow.openCreate}
      />
    );
  }
  if (section === 'PUBLISH') {
    const currentWorld = props.workflow.worlds.find((world) => world.id === props.workflow.selectedWorldId) || null;
    return (
      <ReleasePublishPanel
        world={currentWorld}
        selectedDraftId={props.workflow.selectedDraftId}
        dirtyLabel={props.layout.dirtySummary.shortLabel}
        hasDirty={props.layout.dirtySummary.hasDirty}
        onOpenCreate={props.actions.workflow.openCreate}
      />
    );
  }
  if (section === 'HISTORY') {
    return <ReleaseHistoryPanel mutations={props.status.mutations} />;
  }
  return null;
}

export function MaintainWorkbench(props: MaintainWorkbenchProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-auto px-5 py-5">
        <div className="space-y-4">
          <SectionNav
            activeDomain={props.workflow.activeDomain}
            activeSection={props.workflow.activeDomain === 'AGENTS' && props.workflow.activeSection === 'EDITOR'
              ? 'REGISTRY'
              : props.workflow.activeSection}
            onSelectSection={props.actions.workflow.selectMaintainSection}
          />
          <MaintainObjectHeader {...props} />
          <SectionContextCard workflow={props.workflow} />
          <ConflictBanner status={props.status} actions={props.actions.maintain} working={props.main.working} />
          {renderMaintainSection(props)}
        </div>
      </div>

      <StickyActionBar>
        {renderContextualActionBar(props)}
      </StickyActionBar>
    </div>
  );
}
