import type { EventNodeDraft, WorldStudioCreateStep, WorldStudioSnapshotPatch, WorldStudioWorkspaceSnapshot } from '../contracts.js';
import type { Phase1Result, Phase2Result } from '../generation/pipeline.js';
import type { useWorldStudioControllerContext } from './world-studio-controller-context.js';
import type { useWorldStudioPageUiState } from './use-world-studio-page-ui-state.js';
import type {
  WorldStudioActionsSlice,
  WorldStudioCreateDisplayStage,
  WorldStudioCreateStageAccess,
  WorldStudioDirtySummary,
  WorldStudioImportSubview,
  WorldStudioMaintainSection,
  WorldStudioReviewSubview,
  WorldStudioScreenModel,
} from './world-studio-screen-model.js';
import { worldStudioMessage } from '../i18n/messages.js';
import type { WorldMutationSummary } from '../ui/types.js';
import type { RetryScope } from '../services/event-graph-map.js';

type ControllerContext = ReturnType<typeof useWorldStudioControllerContext>;
type PageUiState = ReturnType<typeof useWorldStudioPageUiState>;

type BuildWorldStudioScreenModelArgs = {
  title: string;
  subtitle: string;
  ui: PageUiState;
  context: ControllerContext;
  actions: {
    onSelectSourceFile: (file: File | null) => Promise<void>;
    onRunPhase1: (mode?: 'all' | 'failed', forcedRetryErrorCode?: string | null) => Promise<void>;
    onRunPhase2: () => Promise<void>;
    onRefreshPhase1QualityGate: () => void;
    onRebuildEmbeddingIndex: () => Promise<void>;
    onGenerateWorldCover: () => Promise<void>;
    onGenerateCharacterPortrait: (name: string) => Promise<void>;
    onToggleAgentSyncCharacter: (name: string, checked: boolean) => void;
    onAgentDraftChange: (name: string, patch: Partial<WorldStudioWorkspaceSnapshot['agentSync']['draftsByCharacter'][string]>) => void;
    onTimeFlowRatioChange: (value: string) => void;
    onCurrentTimeNodeChange: (value: string) => void;
    onFutureEventsTextChange: (value: string) => void;
    onSyncEvents: (payload?: { force?: boolean }) => Promise<void>;
    onSyncLorebooks: () => Promise<void>;
    onSaveDraft: () => Promise<void>;
    onPublishDraft: () => Promise<void>;
    onResetDraft: () => void;
    pauseTask: () => boolean;
    resumeTask: () => Promise<boolean>;
    cancelTask: () => boolean;
    setExpertMode: (value: boolean) => void;
    onReloadRemoteForConflict: () => Promise<void>;
    onAdoptRemoteSnapshot: () => void;
    refreshResources: () => Promise<void>;
    onSaveMaintenance: (payload?: { force?: boolean }) => Promise<void>;
  };
  snapshot: WorldStudioWorkspaceSnapshot;
  patchSnapshot: (patch: WorldStudioSnapshotPatch) => void;
  patchPanel: (patch: Partial<WorldStudioWorkspaceSnapshot['panel']>) => void;
  setCreateStep: (step: WorldStudioCreateStep) => void;
  loadLanding: () => Promise<void>;
  sourceChunksRef: { current: string[] };
  layoutState: Pick<
    WorldStudioScreenModel['layout'],
    | 'settingsDrawerOpen'
    | 'setSettingsDrawerOpen'
    | 'toggleSettingsDrawer'
  >;
  onOpenRuntimeSetup?: () => void;
};

function deriveCreateDisplayStage(step: WorldStudioCreateStep): WorldStudioCreateDisplayStage {
  if (step === 'CHECKPOINTS') {
    return 'CURATE';
  }
  if (step === 'SYNTHESIZE') {
    return 'GENERATE';
  }
  if (step === 'DRAFT' || step === 'PUBLISH') {
    return 'REVIEW';
  }
  return 'IMPORT';
}

function deriveImportSubview(args: {
  step: WorldStudioCreateStep;
  activeTask: ControllerContext['activeTask'];
  phase1: Phase1Result | null;
  snapshot: WorldStudioWorkspaceSnapshot;
}): WorldStudioImportSubview {
  const activeTask = args.activeTask;
  if (
    activeTask
    && activeTask.kind === 'CREATE_PHASE1'
    && (
      activeTask.status === 'RUNNING'
      || activeTask.status === 'PAUSE_REQUESTED'
      || activeTask.status === 'PAUSED'
      || activeTask.status === 'CANCEL_REQUESTED'
    )
  ) {
    return 'RUNNING';
  }
  if (!args.phase1 && !args.snapshot.phase1Artifact) {
    return 'PREPARE';
  }
  return 'RESULT';
}

function deriveReviewSubview(args: {
  step: WorldStudioCreateStep;
  selectedDraftId: string;
  snapshot: WorldStudioWorkspaceSnapshot;
}): WorldStudioReviewSubview {
  const hasDirty = Object.values(args.snapshot.unsavedChangesByPanel).some(Boolean);
  if (args.step === 'DRAFT' || !args.selectedDraftId || hasDirty) {
    return 'EDIT';
  }
  return 'PUBLISH_REVIEW';
}

function deriveMaintainSection(snapshot: WorldStudioWorkspaceSnapshot): WorldStudioMaintainSection {
  const current = String(snapshot.panel.activeMaintainTab || 'WORLD').toUpperCase();
  if (current === 'WORLDVIEW' || current === 'EVENTS' || current === 'LOREBOOKS') {
    return current;
  }
  return 'WORLD';
}

function buildDirtySummary(snapshot: WorldStudioWorkspaceSnapshot): WorldStudioDirtySummary {
  const labelMap: Record<keyof WorldStudioWorkspaceSnapshot['unsavedChangesByPanel'], string> = {
    world: worldStudioMessage('dirty.world', 'World'),
    worldview: worldStudioMessage('dirty.worldview', 'Worldview'),
    events: worldStudioMessage('dirty.events', 'Events'),
    lorebooks: worldStudioMessage('dirty.lorebooks', 'Lorebooks'),
  };
  const labels = Object.entries(snapshot.unsavedChangesByPanel)
    .filter(([, value]) => Boolean(value))
    .map(([key]) => labelMap[key as keyof typeof labelMap]);
  const count = labels.length;
  if (count === 0) {
    return {
      hasDirty: false,
      count: 0,
      labels: [],
      shortLabel: worldStudioMessage('dirty.clean', 'Saved'),
    };
  }
  return {
    hasDirty: true,
    count,
    labels,
    shortLabel: count === 1
      ? worldStudioMessage('dirty.single', '1 unsaved change')
      : worldStudioMessage('dirty.multiple', '{{count}} unsaved changes', { count }),
  };
}

function resolveCurrentObjectLabel(args: {
  landingTarget: 'CREATE' | 'MAINTAIN';
  selectedWorldId: string;
  selectedDraftId: string;
  worlds: ControllerContext['worlds'];
  drafts: ControllerContext['drafts'];
  snapshot: WorldStudioWorkspaceSnapshot;
}): string {
  if (args.landingTarget === 'MAINTAIN') {
    const selectedWorld = args.worlds.find((world) => world.id === args.selectedWorldId) || null;
    const worldName = String(selectedWorld?.name || args.snapshot.worldPatch.name || '').trim();
    if (worldName) {
      return worldStudioMessage('header.currentWorld', 'World: {{name}}', { name: worldName });
    }
    if (args.selectedWorldId) {
      return worldStudioMessage('header.currentWorldId', 'World: {{id}}', { id: args.selectedWorldId });
    }
  }
  if (args.selectedDraftId) {
    return worldStudioMessage('header.currentDraft', 'Draft: {{id}}', { id: args.selectedDraftId });
  }
  const draftName = String(args.snapshot.worldPatch.name || '').trim();
  if (draftName) {
    return worldStudioMessage('header.currentDraftName', 'Draft: {{name}}', { name: draftName });
  }
  return worldStudioMessage('header.newDraft', 'New draft');
}

function patchSnapshotWithReviewFallback(input: {
  snapshot: WorldStudioWorkspaceSnapshot;
  patchSnapshot: (patch: WorldStudioSnapshotPatch) => void;
  setCreateStep: (step: WorldStudioCreateStep) => void;
}, patch: WorldStudioSnapshotPatch) {
  if (input.snapshot.createStep === 'PUBLISH') {
    input.setCreateStep('DRAFT');
  }
  input.patchSnapshot(patch);
}

function buildCreateStageAccess(args: {
  hasPhase1: boolean;
  qualityGateStatus: string | null;
  hasPhase2: boolean;
  hasDraft: boolean;
  currentStep: WorldStudioCreateStep;
}): WorldStudioCreateStageAccess {
  return {
    IMPORT: {
      enabled: true,
      reason: null,
    },
    CURATE: {
      enabled: args.hasPhase1,
      reason: args.hasPhase1
        ? null
        : worldStudioMessage('stageAccess.curate', 'Extract source content before curating checkpoints.'),
    },
    GENERATE: {
      enabled: args.hasPhase1 && args.qualityGateStatus !== 'BLOCK',
      reason: !args.hasPhase1
        ? worldStudioMessage('stageAccess.generate.missingImport', 'Finish import before generating a draft.')
        : args.qualityGateStatus === 'BLOCK'
          ? worldStudioMessage('stageAccess.generate.blocked', 'Resolve the quality gate blockers before generation.')
          : null,
    },
    REVIEW: {
      enabled: args.hasPhase2 || args.hasDraft || args.currentStep === 'DRAFT' || args.currentStep === 'PUBLISH',
      reason: args.hasPhase2 || args.hasDraft || args.currentStep === 'DRAFT' || args.currentStep === 'PUBLISH'
        ? null
        : worldStudioMessage('stageAccess.review', 'Generate a draft before entering review.'),
    },
  };
}

function resolveRequestedCreateStage(
  stage: WorldStudioCreateDisplayStage,
  access: WorldStudioCreateStageAccess,
): WorldStudioCreateDisplayStage {
  const order: WorldStudioCreateDisplayStage[] = ['IMPORT', 'CURATE', 'GENERATE', 'REVIEW'];
  const targetIndex = order.indexOf(stage);
  for (let index = targetIndex; index >= 0; index -= 1) {
    const candidate = order[index];
    if (candidate && access[candidate].enabled) {
      return candidate;
    }
  }
  return 'IMPORT';
}

function buildReviewActions(args: BuildWorldStudioScreenModelArgs): WorldStudioActionsSlice['review'] {
  return {
    onWorldPatchChange: (value) => {
      patchSnapshotWithReviewFallback(args, {
        worldPatch: value,
        unsavedChangesByPanel: {
          ...args.snapshot.unsavedChangesByPanel,
          world: true,
        },
      });
    },
    onWorldviewPatchChange: (value) => {
      patchSnapshotWithReviewFallback(args, {
        worldviewPatch: value,
        unsavedChangesByPanel: {
          ...args.snapshot.unsavedChangesByPanel,
          worldview: true,
        },
      });
    },
    onEventsChange: (value) => {
      patchSnapshotWithReviewFallback(args, {
        eventsDraft: value,
        knowledgeGraph: {
          ...args.snapshot.knowledgeGraph,
          events: value,
        },
        unsavedChangesByPanel: {
          ...args.snapshot.unsavedChangesByPanel,
          events: true,
        },
      });
    },
    onLorebooksChange: (value) => {
      patchSnapshotWithReviewFallback(args, {
        lorebooksDraft: value,
        unsavedChangesByPanel: {
          ...args.snapshot.unsavedChangesByPanel,
          lorebooks: true,
        },
      });
    },
    onEventGraphLayoutChange: (next) => {
      patchSnapshotWithReviewFallback(args, {
        eventGraphLayout: {
          selectedEventId: String(next.selectedEventId || ''),
          expandedPrimaryIds: Array.isArray(next.expandedPrimaryIds)
            ? next.expandedPrimaryIds.map((item) => String(item || '')).filter(Boolean)
            : [],
        },
      });
    },
    saveDraft: () => args.actions.onSaveDraft(),
    publishDraft: () => args.actions.onPublishDraft(),
    backToEdit: () => args.setCreateStep('DRAFT'),
  };
}

function buildCurateActions(args: BuildWorldStudioScreenModelArgs): WorldStudioActionsSlice['curate'] {
  return {
    onSelectStartTimeId: (id) => {
      args.patchSnapshot({
        selectedStartTimeId: id,
        unsavedChangesByPanel: {
          ...args.snapshot.unsavedChangesByPanel,
          events: true,
        },
      });
    },
    onToggleCharacter: (name, checked) => {
      const currentSelected = args.snapshot.selectedCharacters;
      const currentAgentSync = args.snapshot.agentSync.selectedCharacterIds;
      const nextSelectedCharacters = checked
        ? Array.from(new Set([...currentSelected, name]))
        : currentSelected.filter((item) => item !== name);
      const nextAgentSyncSelectedCharacterIds = checked
        ? Array.from(new Set([...currentAgentSync, name]))
        : currentAgentSync.filter((item) => item !== name);
      args.patchSnapshot({
        selectedCharacters: nextSelectedCharacters,
        agentSync: {
          ...args.snapshot.agentSync,
          selectedCharacterIds: nextAgentSyncSelectedCharacterIds,
        },
      });
    },
    onEventsGraphChange: (next) => {
      args.patchSnapshot({
        eventsDraft: next,
        knowledgeGraph: {
          ...args.snapshot.knowledgeGraph,
          events: next,
        },
        unsavedChangesByPanel: {
          ...args.snapshot.unsavedChangesByPanel,
          events: true,
        },
      });
    },
    onEventGraphLayoutChange: (next) => {
      args.patchSnapshot({
        eventGraphLayout: {
          selectedEventId: String(next.selectedEventId || ''),
          expandedPrimaryIds: Array.isArray(next.expandedPrimaryIds)
            ? next.expandedPrimaryIds.map((item) => String(item || '')).filter(Boolean)
            : [],
        },
      });
    },
    refreshQualityGate: () => {
      args.actions.onRefreshPhase1QualityGate();
    },
    continueToGenerate: () => {
      args.setCreateStep('SYNTHESIZE');
    },
  };
}

export function buildWorldStudioScreenModel(args: BuildWorldStudioScreenModelArgs): WorldStudioScreenModel {
  const landingTarget = args.ui.landing.target === 'MAINTAIN' ? 'MAINTAIN' : 'CREATE';
  const effectivePhase1 = args.ui.phase1 || (args.snapshot.phase1Artifact
    ? {
      startTimeOptions: args.snapshot.phase1Artifact.startTimeOptions,
      characterCandidates: args.snapshot.phase1Artifact.characterCandidates,
      knowledgeGraph: args.snapshot.knowledgeGraph,
      finalDraftAccumulator: args.snapshot.finalDraftAccumulator,
      qualityGate: args.snapshot.phase1Artifact.qualityGate,
      chunkTasks: args.snapshot.phase1Artifact.chunkTasks,
      rawText: JSON.stringify({
        restoredFromArtifact: true,
        updatedAt: args.snapshot.phase1Artifact.updatedAt,
        sourceDigest: args.snapshot.phase1Artifact.sourceDigest,
      }),
    }
    : null);
  const createDisplayStage = deriveCreateDisplayStage(args.snapshot.createStep);
  const importSubview = deriveImportSubview({
    step: args.snapshot.createStep,
    activeTask: args.context.activeTask,
    phase1: effectivePhase1,
    snapshot: args.snapshot,
  });
  const reviewSubview = deriveReviewSubview({
    step: args.snapshot.createStep,
    selectedDraftId: args.context.selectedDraftId,
    snapshot: args.snapshot,
  });
  const createStageAccess = buildCreateStageAccess({
    hasPhase1: Boolean(effectivePhase1 || args.snapshot.phase1Artifact),
    qualityGateStatus: effectivePhase1?.qualityGate?.status || args.snapshot.phase1Artifact?.qualityGate?.status || null,
    hasPhase2: Boolean(args.ui.phase2),
    hasDraft: Boolean(args.context.selectedDraftId),
    currentStep: args.snapshot.createStep,
  });
  const maintainSection = deriveMaintainSection(args.snapshot);
  const dirtySummary = buildDirtySummary(args.snapshot);
  const currentObjectLabel = resolveCurrentObjectLabel({
    landingTarget,
    selectedWorldId: args.context.selectedWorldId,
    selectedDraftId: args.context.selectedDraftId,
    worlds: args.context.worlds,
    drafts: args.context.drafts,
    snapshot: args.snapshot,
  });

  const actions: WorldStudioActionsSlice = {
    workflow: {
      loadLanding: args.loadLanding,
      openMaintenance: (worldId) => {
        args.patchPanel({ selectedWorldId: worldId });
        args.ui.setLanding({ target: 'MAINTAIN', worldId, reason: null });
      },
      openCreate: (draftId) => {
        args.ui.setLanding({ target: 'CREATE', worldId: null, reason: null });
        if (draftId) {
          args.patchPanel({ selectedDraftId: draftId });
          args.setCreateStep('DRAFT');
          return;
        }
        args.actions.onResetDraft();
      },
      selectCreateDisplayStage: (stage) => {
        const resolvedStage = resolveRequestedCreateStage(stage, createStageAccess);
        if (resolvedStage === 'IMPORT') {
          args.setCreateStep('SOURCE');
          return;
        }
        if (resolvedStage === 'CURATE') {
          args.setCreateStep('CHECKPOINTS');
          return;
        }
        if (resolvedStage === 'GENERATE') {
          args.setCreateStep('SYNTHESIZE');
          return;
        }
        if (reviewSubview === 'PUBLISH_REVIEW') {
          args.setCreateStep('PUBLISH');
          return;
        }
        args.setCreateStep('DRAFT');
      },
      selectMaintainSection: (section) => {
        args.patchPanel({ activeMaintainTab: section });
      },
      refreshWorkspace: () => args.actions.refreshResources(),
      openRuntimeSetup: args.onOpenRuntimeSetup,
    },
    source: {
      onSourceTextChange: (value) => {
        args.ui.setSourceMode('TEXT');
        args.ui.setFilePreviewText('');
        args.sourceChunksRef.current = [];
        args.patchSnapshot({ sourceText: value });
      },
      onSourceRefChange: (value) => args.patchSnapshot({ sourceRef: value }),
      onSourceEncodingChange: (value) => args.ui.setSourceEncoding(value),
      onSelectSourceFile: args.actions.onSelectSourceFile,
      startExtraction: () => args.actions.onRunPhase1(),
      retryFailed: () => args.actions.onRunPhase1('failed'),
      retryFailedByErrorCode: (errorCode) => {
        args.ui.setRetryErrorCode(errorCode);
        return args.actions.onRunPhase1('failed', errorCode);
      },
      clearRetryErrorCode: () => args.ui.setRetryErrorCode(null),
      setRetryWithFineRoute: (value) => args.ui.setRetryWithFineRoute(value),
      setRetryScope: (value) => {
        args.ui.setRetryScope(value as RetryScope);
        args.ui.setRetryErrorCode(null);
      },
      setRetryConcurrency: (value) => args.ui.setRetryConcurrency(value),
    },
    curate: buildCurateActions(args),
    generate: {
      onTimeFlowRatioChange: args.actions.onTimeFlowRatioChange,
      onCurrentTimeNodeChange: args.actions.onCurrentTimeNodeChange,
      onFutureEventsTextChange: args.actions.onFutureEventsTextChange,
      onGenerateWorldCover: args.actions.onGenerateWorldCover,
      onGenerateCharacterPortrait: args.actions.onGenerateCharacterPortrait,
      onToggleAgentSyncCharacter: args.actions.onToggleAgentSyncCharacter,
      onAgentDraftChange: args.actions.onAgentDraftChange,
      runPhase2: args.actions.onRunPhase2,
    },
    review: buildReviewActions(args),
    maintain: {
      onWorldPatchChange: (value) => {
        args.patchSnapshot({
          worldPatch: value,
          unsavedChangesByPanel: {
            ...args.snapshot.unsavedChangesByPanel,
            world: true,
          },
        });
      },
      onWorldviewPatchChange: (value) => {
        args.patchSnapshot({
          worldviewPatch: value,
          unsavedChangesByPanel: {
            ...args.snapshot.unsavedChangesByPanel,
            worldview: true,
          },
        });
      },
      onEventsChange: (value) => {
        args.patchSnapshot({
          eventsDraft: value,
          knowledgeGraph: {
            ...args.snapshot.knowledgeGraph,
            events: value,
          },
          unsavedChangesByPanel: {
            ...args.snapshot.unsavedChangesByPanel,
            events: true,
          },
        });
      },
      onLorebooksChange: (value) => {
        args.patchSnapshot({
          lorebooksDraft: value,
          unsavedChangesByPanel: {
            ...args.snapshot.unsavedChangesByPanel,
            lorebooks: true,
          },
        });
      },
      onEventGraphLayoutChange: (next) => {
        args.patchSnapshot({
          eventGraphLayout: {
            selectedEventId: String(next.selectedEventId || ''),
            expandedPrimaryIds: Array.isArray(next.expandedPrimaryIds)
              ? next.expandedPrimaryIds.map((item) => String(item || '')).filter(Boolean)
              : [],
          },
        });
      },
      onEventSyncModeChange: (mode) => args.ui.setEventSyncMode(mode),
      saveMaintenance: (payload) => args.actions.onSaveMaintenance(payload),
      syncEvents: (payload) => args.actions.onSyncEvents(payload),
      syncLorebooks: () => args.actions.onSyncLorebooks(),
      refreshResources: () => args.actions.refreshResources(),
      reloadRemote: () => args.actions.onReloadRemoteForConflict(),
      adoptRemoteSnapshot: () => args.actions.onAdoptRemoteSnapshot(),
    },
    routing: {
      onRouteSourceChange: args.context.onRouteSourceChange,
      onRouteConnectorChange: args.context.onRouteConnectorChange,
      onRouteModelChange: args.context.onRouteModelChange,
      onClearRouteBinding: args.context.onClearRouteBinding,
      onRebuildEmbeddingIndex: args.actions.onRebuildEmbeddingIndex,
      onSetExpertMode: args.actions.setExpertMode,
    },
    task: {
      pauseTask: () => args.actions.pauseTask(),
      resumeTask: () => args.actions.resumeTask(),
      cancelTask: () => args.actions.cancelTask(),
    },
  };

  const maintenanceEditorSnapshotVersion = String(
    args.context.maintenanceEditorSnapshotVersion
    || args.snapshot.editorSnapshotVersion
    || '',
  );

  return {
    layout: {
      title: args.title,
      subtitle: args.subtitle,
      currentObjectLabel,
      dirtySummary,
      settingsDrawerOpen: args.layoutState.settingsDrawerOpen,
      setSettingsDrawerOpen: args.layoutState.setSettingsDrawerOpen,
      toggleSettingsDrawer: args.layoutState.toggleSettingsDrawer,
    },
    workflow: {
      landing: args.ui.landing,
      landingTarget,
      worlds: args.context.worlds,
      drafts: args.context.drafts,
      primaryWorld: args.context.primaryWorld,
      latestDraft: args.context.latestDraft,
      selectedWorldId: args.context.selectedWorldId,
      selectedDraftId: args.context.selectedDraftId,
      createDisplayStage,
      createStageAccess,
      maintainSection,
    },
    main: {
      snapshot: args.snapshot,
      phase1: effectivePhase1,
      phase2: args.ui.phase2,
      sourceMode: args.ui.sourceMode,
      sourceEncoding: args.ui.sourceEncoding,
      filePreviewText: args.ui.filePreviewText,
      retryWithFineRoute: args.ui.retryWithFineRoute,
      retryScope: args.ui.retryScope,
      retryConcurrency: args.ui.retryConcurrency,
      retryErrorCode: args.ui.retryErrorCode,
      routeOptions: args.ui.routeOptions,
      eventSyncMode: args.ui.eventSyncMode,
      selectedAgentSyncCharacters: args.context.selectedAgentSyncCharacters,
      eventsGraph: args.context.eventsGraph,
      timeFlowRatio: args.context.timeFlowRatio,
      currentTimeNode: args.context.currentTimeNode,
      importSubview,
      reviewSubview,
      working: args.context.working,
    },
    routing: {
      activeCoarseRouteSource: args.context.activeCoarseRouteSource,
      activeCoarseRouteConnectorId: args.context.activeCoarseRouteConnectorId,
      activeFineRouteSource: args.context.activeFineRouteSource,
      activeFineRouteConnectorId: args.context.activeFineRouteConnectorId,
      effectiveCoarseRouteBinding: args.context.effectiveCoarseRouteBinding,
      effectiveFineRouteBinding: args.context.effectiveFineRouteBinding,
      coarseRouteModelOptions: args.context.coarseRouteModelOptions,
      fineRouteModelOptions: args.context.fineRouteModelOptions,
      routeConnectors: args.ui.routeOptions?.connectors || [],
      routeConfigReady: args.context.routeConfigReady,
      routeConfigReasonCode: args.context.routeConfigReasonCode,
      routeConfigActionHint: args.context.routeConfigActionHint,
      coarseRouteReadiness: args.context.coarseRouteReadiness,
      fineRouteReadiness: args.context.fineRouteReadiness,
      embeddingReadiness: args.context.embeddingReadiness,
      embeddingIndexStatus: args.snapshot.embeddingIndex.status,
      embeddingEntryCount: Object.keys(args.snapshot.embeddingIndex.entries || {}).length,
      embeddingIndexLastBuiltAt: args.snapshot.embeddingIndex.lastBuiltAt,
      embeddingIndexErrorMessage: args.snapshot.embeddingIndex.errorMessage,
      effectiveCoarseRouteSummary: args.context.effectiveCoarseRouteSummary,
      effectiveFineRouteSummary: args.context.effectiveFineRouteSummary,
    },
    status: {
      landingLoading: args.ui.landingLoading,
      activeTask: args.context.activeTask,
      recentTasks: args.context.recentTasks,
      expertMode: args.context.expertMode,
      notice: args.ui.notice,
      error: args.ui.error,
      conflictReloadSummary: args.ui.conflictReloadSummary,
      hasMaintenanceConflict: Boolean(args.ui.error?.includes('WORLD_STUDIO_MAINTENANCE_CONFLICT')),
      maintenanceEditorSnapshotVersion,
      mutations: (args.context.queries.mutationsQuery.data || []) as WorldMutationSummary[],
      storyProjectionCount: args.context.storyProjectionSummary.storyCount,
      storyProjectionMissingContextCount: args.context.storyProjectionSummary.missingContextCount,
      storyProjectionLatestAt: args.context.storyProjectionSummary.latestProjectedAt,
      primaryEventCount: args.context.primaryEventCount,
      secondaryEventCount: args.context.secondaryEventCount,
      missingPrimaryEvidenceCount: args.context.missingPrimaryEvidenceCount,
      eventCharacterCoverage: args.context.eventCharacterCoverage,
      eventLocationCoverage: args.context.eventLocationCoverage,
      terminalChunkSuccess: args.context.terminalChunkSuccess,
      terminalChunkTotal: args.context.terminalChunkTotal,
      terminalChunkFailed: args.context.terminalChunkFailed,
      terminalTopFailure: args.context.terminalTopFailure,
    },
    actions,
  };
}
