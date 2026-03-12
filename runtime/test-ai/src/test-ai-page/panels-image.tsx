import React from 'react';
import { IMAGE_WORKFLOW_PRESET_SELECTIONS, artifactsForPresetKind, asString, buildAsyncImageJobOutcome, buildImageGenerateRequestParams, buildImageWorkflowProfileOverrides, buildLocalAIImageWorkflowExtensionsForRequest, isSelectableLocalArtifact, isTerminalScenarioJobStatus, localizeKnownMessage, localizedJobEvent, localizedJobStatus, makeEmptyDiagnostics, resolveEffectiveBinding, scenarioJobEventLabel, scenarioJobStatusLabel, stripArtifacts, toArtifactPreviewUri, toPrettyJson, useTestAiLocale, } from './core.js';
import type { CapabilityState, ImageWorkflowDraftState, ImageWorkflowPresetSelectionKey, } from './core.js';
import { DiagnosticsPanel, ErrorBox, InfoBox, RawJsonSection, RouteBindingEditor, RunButton, } from './components.js';
import { ImageDraftEditor } from './image-draft-editor.js';
import { ImageJobPanel } from './image-job-panel.js';
import { type ModRuntimeClient, type ModRuntimeLocalArtifactRecord, type ModRuntimeResolvedBinding, type RuntimeCanonicalCapability, type RuntimeRouteBinding } from "@nimiplatform/sdk/mod";
type ImageGeneratePanelProps = {
    mode: 'generate' | 'job';
    state: CapabilityState;
    runtimeClient: ModRuntimeClient;
    draft: ImageWorkflowDraftState;
    onDraftChange: React.Dispatch<React.SetStateAction<ImageWorkflowDraftState>>;
    onStateChange: (updater: (prev: CapabilityState) => CapabilityState) => void;
    onRouteReload: () => void;
    onBindingChange: (binding: RuntimeRouteBinding | null) => void;
};
export function ImageGeneratePanel(props: ImageGeneratePanelProps) {
    const locale = useTestAiLocale();
    const { mode, state, runtimeClient, draft, onDraftChange, onStateChange, onRouteReload, onBindingChange, } = props;
    const [artifacts, setArtifacts] = React.useState<ModRuntimeLocalArtifactRecord[]>([]);
    const [artifactLoading, setArtifactLoading] = React.useState(false);
    const [artifactError, setArtifactError] = React.useState('');
    const [watchJobId, setWatchJobId] = React.useState('');
    const [jobTimeline, setJobTimeline] = React.useState<Array<Record<string, unknown>>>([]);
    const nextComponentIdRef = React.useRef(draft.componentDrafts.length + 1);
    const watchSequenceRef = React.useRef(0);
    const effectiveBinding = React.useMemo(() => resolveEffectiveBinding(state.snapshot, state.binding), [state.snapshot, state.binding]);
    const isLocalRuntimeWorkflow = effectiveBinding?.source === 'local';
    const localEngine = asString(isLocalRuntimeWorkflow
        ? (effectiveBinding?.engine || effectiveBinding?.provider)
        : '');
    const isLocalAIImageWorkflow = isLocalRuntimeWorkflow && localEngine.toLowerCase() === 'localai';
    const updateDraft = React.useCallback((updater: Partial<ImageWorkflowDraftState> | ((prev: ImageWorkflowDraftState) => ImageWorkflowDraftState)) => {
        onDraftChange((prev) => {
            if (typeof updater === 'function') {
                return updater(prev);
            }
            return { ...prev, ...updater };
        });
    }, [onDraftChange]);
    React.useEffect(() => {
        if (!isLocalAIImageWorkflow) {
            setArtifacts([]);
            setArtifactLoading(false);
            setArtifactError('');
            return;
        }
        let cancelled = false;
        setArtifactLoading(true);
        setArtifactError('');
        void runtimeClient.local.listArtifacts(localEngine ? { engine: localEngine } : undefined).then((rows) => {
            if (cancelled)
                return;
            setArtifacts(rows);
            setArtifactLoading(false);
        }).catch((error) => {
            if (cancelled)
                return;
            setArtifacts([]);
            setArtifactLoading(false);
            setArtifactError(error instanceof Error ? error.message : String(error || locale.image.localArtifactsMissing));
        });
        return () => {
            cancelled = true;
        };
    }, [runtimeClient, isLocalAIImageWorkflow, localEngine]);
    React.useEffect(() => {
        if (!isLocalAIImageWorkflow) {
            return;
        }
        const selectableArtifactIds = new Set(artifacts
            .filter(isSelectableLocalArtifact)
            .map((artifact) => artifact.localArtifactId));
        const nextPresetSelections = Object.fromEntries(IMAGE_WORKFLOW_PRESET_SELECTIONS.map((preset) => {
            const current = draft[preset.key];
            return [
                preset.key,
                current && selectableArtifactIds.has(current) ? current : '',
            ];
        })) as Record<ImageWorkflowPresetSelectionKey, string>;
        const nextComponentDrafts = draft.componentDrafts.map((component) => (component.localArtifactId && !selectableArtifactIds.has(component.localArtifactId)
            ? { ...component, localArtifactId: '' }
            : component));
        const presetSelectionsChanged = IMAGE_WORKFLOW_PRESET_SELECTIONS.some((preset) => (nextPresetSelections[preset.key] !== draft[preset.key]));
        const componentDraftsChanged = nextComponentDrafts.some((component, index) => (component.localArtifactId !== draft.componentDrafts[index]?.localArtifactId));
        if (presetSelectionsChanged || componentDraftsChanged) {
            updateDraft((prev) => ({
                ...prev,
                ...nextPresetSelections,
                componentDrafts: nextComponentDrafts,
            }));
        }
    }, [artifacts, draft, isLocalAIImageWorkflow, updateDraft]);
    const handleComponentChange = React.useCallback((componentId: string, key: 'slot' | 'localArtifactId', value: string) => {
        updateDraft((prev) => ({
            ...prev,
            componentDrafts: prev.componentDrafts.map((component) => (component.id === componentId
                ? { ...component, [key]: value }
                : component)),
        }));
    }, [updateDraft]);
    const handleAddComponent = React.useCallback(() => {
        updateDraft((prev) => ({
            ...prev,
            componentDrafts: [
                ...prev.componentDrafts,
                {
                    id: `component-${nextComponentIdRef.current++}`,
                    slot: '',
                    localArtifactId: '',
                },
            ],
        }));
    }, [updateDraft]);
    const handleRemoveComponent = React.useCallback((componentId: string) => {
        updateDraft((prev) => ({
            ...prev,
            componentDrafts: prev.componentDrafts.filter((component) => component.id !== componentId),
        }));
    }, [updateDraft]);
    const buildRequestContext = React.useCallback(() => {
        if (!asString(draft.prompt)) {
            return { error: locale.image.promptEmpty };
        }
        const profileOverridesResult = buildImageWorkflowProfileOverrides({
            step: draft.step,
            cfgScale: draft.cfgScale,
            sampler: draft.sampler,
            scheduler: draft.scheduler,
            optionsText: draft.optionsText,
            rawJsonText: draft.rawProfileOverridesText,
        });
        if (profileOverridesResult.error) {
            return { error: localizeKnownMessage(profileOverridesResult.error, locale) };
        }
        const binding = effectiveBinding || undefined;
        const nNum = Math.max(1, Number(draft.n) || 1);
        let extensions: Record<string, unknown> | undefined;
        if (isLocalAIImageWorkflow) {
            const localWorkflow = buildLocalAIImageWorkflowExtensionsForRequest({
                vaeModel: draft.vaeModel,
                llmModel: draft.llmModel,
                clipLModel: draft.clipLModel,
                clipGModel: draft.clipGModel,
                controlnetModel: draft.controlnetModel,
                loraModel: draft.loraModel,
                auxiliaryModel: draft.auxiliaryModel,
                components: draft.componentDrafts,
                profileOverrides: profileOverridesResult.overrides,
            });
            if (localWorkflow.error) {
                return { error: localizeKnownMessage(localWorkflow.error, locale) };
            }
            extensions = localWorkflow.extensions;
        }
        return {
            error: '',
            binding,
            requestParams: buildImageGenerateRequestParams({
                prompt: draft.prompt,
                negativePrompt: draft.negativePrompt,
                n: nNum,
                size: draft.size,
                seed: draft.seed,
                timeoutMs: draft.timeoutMs,
                responseFormatMode: draft.responseFormatMode,
                extensions,
                binding,
            }),
        };
    }, [draft, effectiveBinding, isLocalAIImageWorkflow, locale]);
    const finalizeAsyncImageJob = React.useCallback(async (input: {
        jobId: string;
        requestParams: Record<string, unknown> | null;
        resolved: ModRuntimeResolvedBinding | null;
        job?: Record<string, unknown> | null;
        elapsed: number;
    }) => {
        let artifactFetchError = '';
        let artifactsResponse: {
            artifacts: Array<{
                uri?: string;
                bytes?: Uint8Array;
                mimeType?: string;
            }>;
            traceId?: string;
        } = {
            artifacts: [],
        };
        try {
            const response = await runtimeClient.media.jobs.getArtifacts(input.jobId);
            artifactsResponse = {
                artifacts: Array.isArray(response.artifacts) ? response.artifacts : [],
                traceId: response.traceId,
            };
        }
        catch (error) {
            artifactFetchError = error instanceof Error ? error.message : String(error || 'Failed to fetch image job artifacts.');
        }
        const artifactsTraceId = 'traceId' in artifactsResponse
            ? asString(artifactsResponse.traceId)
            : '';
        const uris = (artifactsResponse.artifacts || [])
            .map((artifact) => toArtifactPreviewUri({
            uri: artifact.uri,
            bytes: artifact.bytes,
            mimeType: artifact.mimeType,
            defaultMimeType: 'image/png',
        }))
            .filter(Boolean);
        const jobRecord = input.job || {};
        const outcome = buildAsyncImageJobOutcome({
            status: jobRecord.status,
            reasonDetail: jobRecord.reasonDetail,
            artifactFetchError,
        });
        onStateChange((prev) => ({
            ...prev,
            busy: false,
            busyLabel: '',
            result: outcome.result,
            error: outcome.error,
            output: uris,
            rawResponse: toPrettyJson({
                request: input.requestParams,
                resolved: input.resolved,
                jobId: input.jobId,
                job: input.job,
                events: jobTimeline,
                artifacts: stripArtifacts({ artifacts: artifactsResponse.artifacts }),
                artifactFetchError: artifactFetchError || undefined,
                previewUris: uris,
            }),
            diagnostics: {
                requestParams: input.requestParams,
                resolvedRoute: input.resolved,
                responseMetadata: {
                    jobId: input.jobId,
                    artifactCount: artifactsResponse.artifacts.length,
                    traceId: asString(jobRecord.traceId || artifactsTraceId) || undefined,
                    modelResolved: asString(jobRecord.modelResolved) || undefined,
                    elapsed: input.elapsed,
                },
            },
        }));
    }, [jobTimeline, onStateChange, runtimeClient.media.jobs]);
    const watchAsyncImageJob = React.useCallback(async (input: {
        jobId: string;
        requestParams: Record<string, unknown> | null;
        resolved: ModRuntimeResolvedBinding | null;
        initialJob?: Record<string, unknown> | null;
    }) => {
        const watchToken = ++watchSequenceRef.current;
        const startedAt = Date.now();
        setWatchJobId(input.jobId);
        setJobTimeline([]);
        const pushJobEvent = (label: string, job: Record<string, unknown> | null | undefined, sequence?: unknown) => {
            const normalizedJob = job || {};
            setJobTimeline((prev) => [
                ...prev,
                {
                    sequence: sequence ?? prev.length + 1,
                    label,
                    status: scenarioJobStatusLabel(normalizedJob.status),
                    reasonDetail: asString(normalizedJob.reasonDetail) || undefined,
                    traceId: asString(normalizedJob.traceId) || undefined,
                    providerJobId: asString(normalizedJob.providerJobId) || undefined,
                },
            ]);
        };
        onStateChange((prev) => ({
            ...prev,
            busy: true,
            busyLabel: locale.image.watchingJob,
            error: '',
            output: [],
            diagnostics: {
                requestParams: input.requestParams,
                resolvedRoute: input.resolved,
                responseMetadata: {
                    jobId: input.jobId,
                },
            },
        }));
        let currentJob = input.initialJob || await runtimeClient.media.jobs.get(input.jobId) as unknown as Record<string, unknown>;
        if (watchToken !== watchSequenceRef.current) {
            return;
        }
        pushJobEvent('submitted', currentJob);
        if (isTerminalScenarioJobStatus(currentJob.status)) {
            await finalizeAsyncImageJob({
                jobId: input.jobId,
                requestParams: input.requestParams,
                resolved: input.resolved,
                job: currentJob,
                elapsed: Date.now() - startedAt,
            });
            return;
        }
        const stream = await runtimeClient.media.jobs.subscribe(input.jobId);
        for await (const event of stream) {
            if (watchToken !== watchSequenceRef.current) {
                return;
            }
            currentJob = (event.job as unknown as Record<string, unknown>) || currentJob;
            pushJobEvent(scenarioJobEventLabel(event.eventType), currentJob, event.sequence);
            if (isTerminalScenarioJobStatus(currentJob.status)) {
                await finalizeAsyncImageJob({
                    jobId: input.jobId,
                    requestParams: input.requestParams,
                    resolved: input.resolved,
                    job: currentJob,
                    elapsed: Date.now() - startedAt,
                });
                return;
            }
        }
        if (watchToken !== watchSequenceRef.current) {
            return;
        }
        currentJob = await runtimeClient.media.jobs.get(input.jobId) as unknown as Record<string, unknown>;
        await finalizeAsyncImageJob({
            jobId: input.jobId,
            requestParams: input.requestParams,
            resolved: input.resolved,
            job: currentJob,
            elapsed: Date.now() - startedAt,
        });
    }, [finalizeAsyncImageJob, locale, onStateChange, runtimeClient.media.jobs]);
    const handleRun = React.useCallback(async () => {
        const requestContext = buildRequestContext();
        if (requestContext.error) {
            onStateChange((prev) => ({ ...prev, error: requestContext.error }));
            return;
        }
        if (!requestContext.requestParams) {
            onStateChange((prev) => ({ ...prev, error: locale.image.imageRequestEmpty }));
            return;
        }
        onStateChange((prev) => ({ ...prev, busy: true, error: '', diagnostics: makeEmptyDiagnostics() }));
        const t0 = Date.now();
        const binding = requestContext.binding;
        const requestParams = requestContext.requestParams;
        let resolved: ModRuntimeResolvedBinding | undefined;
        try {
            resolved = await runtimeClient.route.resolve({ capability: 'image.generate', binding });
            if (mode === 'job') {
                const job = await runtimeClient.media.jobs.submit({
                    modal: 'image',
                    input: requestParams,
                });
                await watchAsyncImageJob({
                    jobId: asString((job as unknown as Record<string, unknown>)?.jobId),
                    requestParams,
                    resolved: resolved ?? null,
                    initialJob: job as unknown as Record<string, unknown>,
                });
                return;
            }
            const result = await runtimeClient.media.image.generate(requestParams);
            const elapsed = Date.now() - t0;
            const uris = result.artifacts
                .map((artifact) => toArtifactPreviewUri({
                uri: artifact.uri,
                bytes: artifact.bytes,
                mimeType: artifact.mimeType,
                defaultMimeType: 'image/png',
            }))
                .filter(Boolean);
            onStateChange((prev) => ({
                ...prev,
                busy: false,
                result: 'passed',
                output: uris,
                rawResponse: toPrettyJson({ request: requestParams, resolved, response: stripArtifacts(result), previewUris: uris }),
                diagnostics: {
                    requestParams,
                    resolvedRoute: resolved ?? null,
                    responseMetadata: {
                        jobId: (result.job as unknown as Record<string, unknown>)?.jobId as string | undefined,
                        artifactCount: result.artifacts.length,
                        traceId: result.trace?.traceId,
                        modelResolved: result.trace?.modelResolved,
                        elapsed,
                    },
                },
            }));
        }
        catch (error) {
            const elapsed = Date.now() - t0;
            const message = error instanceof Error ? error.message : String(error || (mode === 'job' ? locale.image.submitFailed : locale.image.generateFailed));
            onStateChange((prev) => ({
                ...prev,
                busy: false,
                result: 'failed',
                error: message,
                output: [],
                rawResponse: toPrettyJson({ request: requestParams, resolved, error: message }),
                diagnostics: { requestParams, resolvedRoute: resolved ?? null, responseMetadata: { elapsed } },
            }));
        }
    }, [
        buildRequestContext,
        locale,
        mode,
        runtimeClient,
        onStateChange,
        watchAsyncImageJob,
    ]);
    const handleWatchExistingJob = React.useCallback(async () => {
        const targetJobId = asString(watchJobId);
        if (!targetJobId) {
            onStateChange((prev) => ({ ...prev, error: locale.image.jobIdEmpty }));
            return;
        }
        try {
            await watchAsyncImageJob({
                jobId: targetJobId,
                requestParams: { jobId: targetJobId, mode: 'attach' },
                resolved: null,
            });
        }
        catch (error) {
            onStateChange((prev) => ({
                ...prev,
                busy: false,
                busyLabel: '',
                result: 'failed',
                error: error instanceof Error ? error.message : String(error || locale.image.watchFailed),
            }));
        }
    }, [locale, onStateChange, watchAsyncImageJob, watchJobId]);
    const handleCancelJob = React.useCallback(async () => {
        const targetJobId = asString(watchJobId);
        if (!targetJobId) {
            onStateChange((prev) => ({ ...prev, error: locale.image.jobIdEmpty }));
            return;
        }
        try {
            const canceled = await runtimeClient.media.jobs.cancel({
                jobId: targetJobId,
                reason: 'test-ai user canceled image job',
            });
            setJobTimeline((prev) => [
                ...prev,
                {
                    sequence: prev.length + 1,
                    label: 'canceled',
                    status: scenarioJobStatusLabel((canceled as unknown as Record<string, unknown>)?.status),
                    reasonDetail: asString((canceled as unknown as Record<string, unknown>)?.reasonDetail) || undefined,
                },
            ]);
        }
        catch (error) {
            onStateChange((prev) => ({
                ...prev,
                error: error instanceof Error ? error.message : String(error || locale.image.cancelFailed),
            }));
        }
    }, [locale, onStateChange, runtimeClient.media.jobs, watchJobId]);
    const imageUris = (state.output as string[] | null) || [];
    const companionPresetArtifacts = React.useMemo(() => (Object.fromEntries(IMAGE_WORKFLOW_PRESET_SELECTIONS.map((preset) => [
        preset.key,
        artifactsForPresetKind(artifacts, preset.kind),
    ])) as Record<ImageWorkflowPresetSelectionKey, ModRuntimeLocalArtifactRecord[]>), [artifacts]);
    const hasKnownCompanionArtifacts = React.useMemo(() => IMAGE_WORKFLOW_PRESET_SELECTIONS.some((preset) => (companionPresetArtifacts[preset.key] || []).length > 0), [companionPresetArtifacts]);
    const coreCompanionPresets = React.useMemo(() => IMAGE_WORKFLOW_PRESET_SELECTIONS.filter((preset) => preset.tier === 'core'), []);
    const extendedCompanionPresets = React.useMemo(() => IMAGE_WORKFLOW_PRESET_SELECTIONS.filter((preset) => preset.tier === 'extended'), []);
    return (<div className="flex flex-col gap-3">
      <RouteBindingEditor capabilityId="image.generate" snapshot={state.snapshot} binding={state.binding} loading={state.routeLoading} error={state.routeError} onReload={onRouteReload} onBindingChange={onBindingChange}/>
      <ImageDraftEditor draft={draft} updateDraft={updateDraft} isLocalAIImageWorkflow={isLocalAIImageWorkflow} artifacts={artifacts} artifactLoading={artifactLoading} artifactError={artifactError} hasKnownCompanionArtifacts={hasKnownCompanionArtifacts} coreCompanionPresets={coreCompanionPresets} extendedCompanionPresets={extendedCompanionPresets} companionPresetArtifacts={companionPresetArtifacts} onAddComponent={handleAddComponent} onRemoveComponent={handleRemoveComponent} onComponentChange={handleComponentChange}/>
      {mode === 'job' ? (<ImageJobPanel busy={state.busy} busyLabel={state.busyLabel} watchJobId={watchJobId} onWatchJobIdChange={setWatchJobId} onWatchExistingJob={() => { void handleWatchExistingJob(); }} onCancelJob={() => { void handleCancelJob(); }} onSubmitJob={() => { void handleRun(); }} jobTimeline={jobTimeline}/>) : (<RunButton busy={state.busy} busyLabel={state.busyLabel} label={locale.image.runGenerate} onClick={() => { void handleRun(); }}/>)}
      {state.error ? <ErrorBox message={state.error}/> : null}
      {imageUris.length > 0 ? (<div className="grid grid-cols-2 gap-2">
          {imageUris.map((uri) => (<img key={uri} alt={locale.image.generatedAlt} src={uri} className="rounded-lg border border-gray-200"/>))}
        </div>) : null}
      <DiagnosticsPanel diagnostics={state.diagnostics}/>
      {state.rawResponse ? <RawJsonSection content={state.rawResponse}/> : null}
    </div>);
}
