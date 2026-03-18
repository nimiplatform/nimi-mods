import React from 'react';
import { getTestAiRuntimeClient } from './runtime-mod.js';
import { CAPABILITIES, capabilityCopy, createInitialImageWorkflowDraftState, loadRouteSnapshot, makeInitialCapabilityStates, useTestAiLocale, } from './test-ai-page/core.js';
import type { CapabilityId, CapabilityState, ImageWorkflowDraftState, } from './test-ai-page/core.js';
import { CapabilitySidebar } from './test-ai-page/components.js';
import { TextEmbedPanel, TextGeneratePanel } from './test-ai-page/panels-text.js';
import { ImageGeneratePanel } from './test-ai-page/panels-image.js';
import { AudioSynthesizePanel, AudioTranscribePanel, VideoGeneratePanel, VoiceClonePanel, VoiceDesignPanel, } from './test-ai-page/panels-media.js';
import { type RuntimeCanonicalCapability, type RuntimeRouteBinding } from "@nimiplatform/sdk/mod";
export { MEDIA_IMAGE_COMPONENTS_REQUIRED_ERROR, bindingForModel, buildAsyncImageJobOutcome, buildImageGenerateRequestParams, buildImageWorkflowComponentSelections, buildImageWorkflowProfileOverrides, buildMediaImageWorkflowExtensionsForRequest, resolveRouteModelPickerState, scenarioJobEventLabel, scenarioJobStatusLabel, toArtifactPreviewUri, } from './test-ai-page/core.js';
export function TestAiPage() {
    const locale = useTestAiLocale();
    const runtimeClient = React.useMemo(() => getTestAiRuntimeClient(), []);
    const [activeCapability, setActiveCapability] = React.useState<CapabilityId>('text.generate');
    const [states, setStates] = React.useState(makeInitialCapabilityStates);
    const [imageDraft, setImageDraft] = React.useState<ImageWorkflowDraftState>(() => (createInitialImageWorkflowDraftState(locale.image.defaultPrompt, locale.image.defaultNegativePrompt)));
    const updateCapabilityState = React.useCallback((capabilityId: CapabilityId, updater: (prev: CapabilityState) => CapabilityState) => {
        setStates((prev) => ({ ...prev, [capabilityId]: updater(prev[capabilityId]) }));
    }, []);
    const updateSharedImageBinding = React.useCallback((binding: RuntimeRouteBinding | null) => {
        setStates((prev) => ({
            ...prev,
            'image.generate': { ...prev['image.generate'], binding },
            'image.create-job': { ...prev['image.create-job'], binding },
        }));
    }, []);
    const reloadRouteFor = React.useCallback((capabilityId: CapabilityId) => {
        void loadRouteSnapshot({ runtimeClient, capabilityId, setStates });
    }, [runtimeClient]);
    React.useEffect(() => {
        const loadedCapabilities = new Set<RuntimeCanonicalCapability>();
        for (const cap of CAPABILITIES) {
            if (!cap.hasRoute || !cap.routeCapability || loadedCapabilities.has(cap.routeCapability)) {
                continue;
            }
            loadedCapabilities.add(cap.routeCapability);
            void loadRouteSnapshot({ runtimeClient, capabilityId: cap.id, setStates });
        }
    }, [runtimeClient]);
    const activeState = states[activeCapability];
    const activeMeta = CAPABILITIES.find((capability) => capability.id === activeCapability)!;
    const activeCopy = capabilityCopy(locale, activeMeta.id);
    const renderPanel = () => {
        switch (activeCapability) {
            case 'text.generate':
                return (<TextGeneratePanel state={activeState} runtimeClient={runtimeClient} onStateChange={(updater) => updateCapabilityState('text.generate', updater)} onRouteReload={() => reloadRouteFor('text.generate')}/>);
            case 'text.embed':
                return (<TextEmbedPanel state={activeState} runtimeClient={runtimeClient} onStateChange={(updater) => updateCapabilityState('text.embed', updater)} onRouteReload={() => reloadRouteFor('text.embed')}/>);
            case 'image.generate':
                return (<ImageGeneratePanel mode="generate" state={activeState} runtimeClient={runtimeClient} draft={imageDraft} onDraftChange={setImageDraft} onStateChange={(updater) => updateCapabilityState('image.generate', updater)} onRouteReload={() => reloadRouteFor('image.generate')} onBindingChange={updateSharedImageBinding}/>);
            case 'image.create-job':
                return (<ImageGeneratePanel mode="job" state={activeState} runtimeClient={runtimeClient} draft={imageDraft} onDraftChange={setImageDraft} onStateChange={(updater) => updateCapabilityState('image.create-job', updater)} onRouteReload={() => reloadRouteFor('image.create-job')} onBindingChange={updateSharedImageBinding}/>);
            case 'video.generate':
                return (<VideoGeneratePanel state={activeState} runtimeClient={runtimeClient} onStateChange={(updater) => updateCapabilityState('video.generate', updater)} onRouteReload={() => reloadRouteFor('video.generate')}/>);
            case 'audio.synthesize':
                return (<AudioSynthesizePanel state={activeState} runtimeClient={runtimeClient} onStateChange={(updater) => updateCapabilityState('audio.synthesize', updater)} onRouteReload={() => reloadRouteFor('audio.synthesize')}/>);
            case 'audio.transcribe':
                return (<AudioTranscribePanel state={activeState} runtimeClient={runtimeClient} onStateChange={(updater) => updateCapabilityState('audio.transcribe', updater)} onRouteReload={() => reloadRouteFor('audio.transcribe')}/>);
            case 'voice.clone':
                return (<VoiceClonePanel state={activeState} onStateChange={(updater) => updateCapabilityState('voice.clone', updater)}/>);
            case 'voice.design':
                return (<VoiceDesignPanel state={activeState} onStateChange={(updater) => updateCapabilityState('voice.design', updater)}/>);
        }
    };
    return (<div data-nimi-mod-root="test-ai" className="flex h-full min-h-0 flex-row overflow-hidden bg-gray-50 text-sm text-gray-900">
      <CapabilitySidebar active={activeCapability} states={states} onSelect={setActiveCapability}/>
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto p-4">
        <div className="mb-3 px-1">
          <h2 className="text-sm font-semibold text-gray-900">{activeCopy.label}</h2>
        </div>
        {renderPanel()}
      </div>
    </div>);
}
