import { useEffect, useMemo, useRef } from 'react';
import { useShellAuth, useShellBootstrap, useShellNavigation, useShellStatusBanner, } from '@nimiplatform/sdk/mod/shell';
import { WORLD_STUDIO_MOD_ID } from '../contracts.js';
import { createWorldStudioFlowId, emitWorldStudioLog } from '../logging.js';
import { useWorldStudioBootstrap } from '../hooks/use-world-studio-bootstrap.js';
import { useWorldStudioHydration } from '../hooks/use-world-studio-hydration.js';
import { WorldStudioShell } from '../ui/world-studio-shell.js';
import { NoAccessPanel } from '../ui/no-access/no-access-panel.js';
import { useWorldStudioPageUiState } from './use-world-studio-page-ui-state.js';
import { useWorldStudioControllerContext, useWorldStudioStoreBindings, } from './world-studio-controller-context.js';
import { useWorldStudioControllerActions } from './use-world-studio-controller-actions.js';
import { buildWorldStudioScreenModel } from './world-studio-screen-model-builder.js';
import { createWorldStudioRuntimeAiClient } from '../runtime-ai-client.js';
import { getWorldStudioRuntimeClient } from '../runtime-mod.js';
import { createHookClient, useModTranslation } from "@nimiplatform/sdk/mod";
import { useWorldStudioShellState } from './use-world-studio-shell-state.js';
import { WorkflowDrawer } from '../ui/workflow-drawer.js';
import { SettingsDrawer } from '../ui/settings-drawer.js';
import { TaskProgressStrip } from '../ui/task-progress-strip.js';
import { CreateWorkbench } from '../ui/create/create-workbench.js';
import { MaintainWorkbench } from '../ui/maintain/maintain-workbench.js';
function isRouteConfigBlockingNotice(message: string | null): boolean {
    if (!message)
        return false;
    return (message.includes('WORLD_STUDIO_')
        || message.includes('coarse/fine route'));
}
export function useWorldStudioPageContent() {
    const { t } = useModTranslation('world-studio');
    const hookClient = useMemo(() => createHookClient(WORLD_STUDIO_MOD_ID), []);
    const runtimeClient = useMemo(() => getWorldStudioRuntimeClient(), []);
    const aiClient = useMemo(() => createWorldStudioRuntimeAiClient(runtimeClient), [runtimeClient]);
    const flowId = useMemo(() => createWorldStudioFlowId('world-studio-page'), []);
    const { user: runtimeUser } = useShellAuth();
    const { ready: bootstrapReady } = useShellBootstrap();
    const { activeTab, setActiveTab } = useShellNavigation();
    const { showStatusBanner: setStatusBanner } = useShellStatusBanner();
    const userId = String((runtimeUser && runtimeUser.id) || '').trim();
    const storeBindings = useWorldStudioStoreBindings(userId);
    const ui = useWorldStudioPageUiState();
    const lastHydratedWorldIdRef = useRef('');
    const lastHydratedDraftIdRef = useRef('');
    const lastHydratedPhase1ArtifactRef = useRef('');
    const sourceChunksRef = useRef<string[]>([]);
    const sourceRawTextRef = useRef('');
    const context = useWorldStudioControllerContext({
        hookClient,
        userId,
        landingLoading: ui.landingLoading,
        landing: ui.landing,
        routeOptions: ui.routeOptions,
        snapshot: storeBindings.snapshot,
        phase1: ui.phase1,
    });
    const { loadLanding, loadRuntimeRouteOptions, resolveRuntimeDefaultRouteBinding } = useWorldStudioBootstrap({
        bootstrapReady,
        flowId,
        hookClient,
        runtimeClient,
        runtimeDefaultRouteBinding: context.runtimeDefaultRouteBinding,
        setRouteOptions: ui.setRouteOptions,
        setLanding: ui.setLanding,
        setLandingLoading: ui.setLandingLoading,
        setError: ui.setError,
    });
    useEffect(() => {
        const artifact = storeBindings.snapshot.phase1Artifact;
        if (!artifact) {
            lastHydratedPhase1ArtifactRef.current = '';
            if (ui.phase1) {
                ui.setPhase1(null);
            }
            return;
        }
        const artifactVersion = [
            artifact.updatedAt,
            artifact.sourceDigest,
            String(artifact.chunkTasks.length),
            String(storeBindings.snapshot.knowledgeGraph.events.primary.length),
            String(storeBindings.snapshot.knowledgeGraph.events.secondary.length),
        ].join(':');
        if (artifactVersion === lastHydratedPhase1ArtifactRef.current && ui.phase1)
            return;
        const restored = {
            startTimeOptions: artifact.startTimeOptions,
            characterCandidates: artifact.characterCandidates,
            knowledgeGraph: storeBindings.snapshot.knowledgeGraph,
            finalDraftAccumulator: storeBindings.snapshot.finalDraftAccumulator,
            qualityGate: artifact.qualityGate,
            chunkTasks: artifact.chunkTasks,
            rawText: JSON.stringify({
                restoredFromArtifact: true,
                updatedAt: artifact.updatedAt,
                sourceDigest: artifact.sourceDigest,
            }),
        };
        if (!restored)
            return;
        ui.setPhase1(restored);
        lastHydratedPhase1ArtifactRef.current = artifactVersion;
    }, [
        storeBindings.snapshot,
        ui.phase1,
        ui.setPhase1,
    ]);
    useWorldStudioHydration({
        hookClient,
        landing: ui.landing,
        worlds: context.worlds,
        selectedWorldId: context.selectedWorldId,
        selectedDraftId: context.selectedDraftId,
        patchPanel: storeBindings.patchPanel,
        setCreateStep: storeBindings.setCreateStep,
        patchSnapshot: storeBindings.patchSnapshot,
        snapshot: storeBindings.snapshot,
        queries: {
            maintenanceQuery: { data: context.queries.maintenanceQuery.data },
            eventsQuery: { data: context.queries.eventsQuery.data },
            lorebooksQuery: { data: context.queries.lorebooksQuery.data },
            creatorAgentsQuery: { data: context.queries.creatorAgentsQuery.data },
            resourceBindingsQuery: { data: context.queries.resourceBindingsQuery.data },
        },
        setSourceMode: ui.setSourceMode,
        setFilePreviewText: ui.setFilePreviewText,
        sourceChunksRef,
        sourceRawTextRef,
        setError: (value) => ui.setError(value),
        lastHydratedDraftIdRef,
        lastHydratedWorldIdRef,
    });
    const actions = useWorldStudioControllerActions({
        create: {
            aiClient,
            flowId,
            sourceEncoding: ui.sourceEncoding,
            setSourceEncoding: ui.setSourceEncoding,
            sourceMode: ui.sourceMode,
            setSourceMode: ui.setSourceMode,
            setFilePreviewText: ui.setFilePreviewText,
            sourceChunksRef,
            sourceRawTextRef,
            routeOptions: ui.routeOptions,
            snapshot: storeBindings.snapshot,
            patchSnapshot: storeBindings.patchSnapshot,
            patchPanel: storeBindings.patchPanel,
            setCreateStep: storeBindings.setCreateStep,
            setPhase1: ui.setPhase1,
            setPhase2: ui.setPhase2,
            phase1: ui.phase1,
            retryConcurrency: ui.retryConcurrency,
            retryErrorCode: ui.retryErrorCode,
            retryScope: ui.retryScope,
            retryWithFineRoute: ui.retryWithFineRoute,
            resolveEffectiveRouteBindings: context.resolveEffectiveRouteBindings,
            resolveRuntimeDefaultRouteBinding,
            bindingMap: context.bindingMap,
            runtimeDefaultRouteBinding: context.runtimeDefaultRouteBinding,
            selectedDraftId: context.selectedDraftId,
            selectedWorldId: context.selectedWorldId,
            setLanding: ui.setLanding,
            mutations: context.mutations,
            queries: context.queries,
            setStatusBanner,
            setError: ui.setError,
            setNotice: ui.setNotice,
        },
        maintain: {
            flowId,
            selectedWorldId: context.selectedWorldId,
            eventSyncMode: ui.eventSyncMode,
            eventsGraph: context.eventsGraph,
            snapshot: storeBindings.snapshot,
            patchSnapshot: storeBindings.patchSnapshot,
            mutations: context.mutations,
            queries: context.queries,
            setStatusBanner,
            setError: ui.setError,
            setNotice: ui.setNotice,
        },
        conflict: {
            selectedWorldId: context.selectedWorldId,
            snapshot: storeBindings.snapshot,
            patchSnapshot: storeBindings.patchSnapshot,
            queries: context.queries,
            setError: ui.setError,
            setNotice: ui.setNotice,
            setConflictReloadSummary: ui.setConflictReloadSummary,
            lastHydratedWorldIdRef,
        },
        workspace: {
            snapshot: storeBindings.snapshot,
            patchSnapshot: storeBindings.patchSnapshot,
            setPhase1: ui.setPhase1,
            setPhase2: ui.setPhase2,
            setSourceMode: ui.setSourceMode,
            setFilePreviewText: ui.setFilePreviewText,
            setConflictReloadSummary: ui.setConflictReloadSummary,
            sourceChunksRef,
            sourceRawTextRef,
            resetSnapshot: storeBindings.resetSnapshot,
            maintenanceEditorSnapshotVersion: context.maintenanceEditorSnapshotVersion,
            setError: ui.setError,
            setNotice: ui.setNotice,
        },
    });
    useEffect(() => {
        if (!context.routeConfigReady)
            return;
        if (ui.error?.includes('WORLD_STUDIO_ROUTE_CONFIG_REQUIRED')) {
            ui.setError(null);
        }
        if (isRouteConfigBlockingNotice(ui.notice)) {
            ui.setNotice(null);
        }
    }, [context.routeConfigReady, ui.error, ui.notice, ui.setError, ui.setNotice]);
    useEffect(() => {
        emitWorldStudioLog({
            level: 'info',
            message: 'world-studio:ui:view-mounted',
            flowId,
            source: 'WorldStudioPage',
            details: { userId },
        });
    }, [flowId, userId]);
    useEffect(() => {
        if (!bootstrapReady)
            return;
        if (activeTab !== `mod:${WORLD_STUDIO_MOD_ID}`)
            return;
        void loadRuntimeRouteOptions();
    }, [activeTab, bootstrapReady, loadRuntimeRouteOptions]);
    const landingTarget = ui.landing.target === 'MAINTAIN' ? 'MAINTAIN' : 'CREATE';
    const shellState = useWorldStudioShellState();
    const screenModel = buildWorldStudioScreenModel({
        title: t('page.title'),
        subtitle: landingTarget === 'CREATE' ? t('page.subtitleCreate') : t('page.subtitleMaintain'),
        ui,
        context,
        actions,
        snapshot: storeBindings.snapshot,
        patchSnapshot: storeBindings.patchSnapshot,
        patchPanel: storeBindings.patchPanel,
        setCreateStep: storeBindings.setCreateStep,
        loadLanding,
        sourceChunksRef,
        layoutState: shellState,
        onOpenRuntimeSetup: () => {
            setActiveTab('runtime');
        },
    });
    if (screenModel.status.landingLoading) {
        return <div className="p-4 text-sm text-gray-600">{t('page.loading')}</div>;
    }
    if (screenModel.workflow.landing.target === 'NO_ACCESS') {
        return (<NoAccessPanel reason={screenModel.workflow.landing.reason} error={screenModel.status.error} onRetry={() => {
                void screenModel.actions.workflow.loadLanding();
            }}/>);
    }
    const mainPanel = screenModel.workflow.landingTarget === 'CREATE'
        ? (<CreateWorkbench workflow={screenModel.workflow} main={screenModel.main} routing={screenModel.routing} status={screenModel.status} actions={screenModel.actions}/>)
        : (<MaintainWorkbench layout={screenModel.layout} workflow={screenModel.workflow} main={screenModel.main} status={screenModel.status} actions={screenModel.actions}/>);
    return (<WorldStudioShell title={screenModel.layout.title} subtitle={screenModel.layout.subtitle} currentObjectLabel={screenModel.layout.currentObjectLabel} isDirty={screenModel.layout.dirtySummary.hasDirty} dirtyLabel={screenModel.layout.dirtySummary.shortLabel} settingsDrawerOpen={screenModel.layout.settingsDrawerOpen} onToggleSettingsDrawer={screenModel.layout.toggleSettingsDrawer} onCloseSettingsDrawer={() => screenModel.layout.setSettingsDrawerOpen(false)} taskStrip={<TaskProgressStrip status={screenModel.status} onPauseTask={screenModel.actions.task.pauseTask} onResumeTask={screenModel.actions.task.resumeTask} onCancelTask={screenModel.actions.task.cancelTask}/>} mainPanel={mainPanel} workflowSidebar={<WorkflowDrawer layout={screenModel.layout} workflow={screenModel.workflow} main={screenModel.main} routing={screenModel.routing} status={screenModel.status} actions={screenModel.actions}/>} settingsDrawer={<SettingsDrawer routing={screenModel.routing} actions={screenModel.actions}/>}/>);
}
