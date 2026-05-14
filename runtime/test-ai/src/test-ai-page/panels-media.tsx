import React from 'react';
import { asString, makeEmptyDiagnostics, resolveEffectiveBinding, stripArtifacts, toArtifactPreviewUri, toPrettyJson, useTestAiLocale, } from './core.js';
import type { CapabilityState, VoiceOption, } from './core.js';
import { DiagnosticsPanel, ErrorBox, RawJsonSection, RouteBindingEditor, RunButton, } from './components.js';
import { type ModRuntimeClient, type ModRuntimeResolvedBinding, type RuntimeCanonicalCapability } from "@nimiplatform/sdk/mod";
type VideoMode = 't2v' | 'i2v-first-frame' | 'i2v-reference';
type VideoGeneratePanelProps = {
    state: CapabilityState;
    runtimeClient: ModRuntimeClient;
    onStateChange: (updater: (prev: CapabilityState) => CapabilityState) => void;
    onRouteReload: () => void;
};
export function VideoGeneratePanel(props: VideoGeneratePanelProps) {
    const locale = useTestAiLocale();
    const { state, runtimeClient, onStateChange, onRouteReload } = props;
    const [mode, setMode] = React.useState<VideoMode>('t2v');
    const [prompt, setPrompt] = React.useState<string>(locale.video.defaultPrompt);
    const [refImageUri, setRefImageUri] = React.useState('');
    const [ratio, setRatio] = React.useState('16:9');
    const [durationSec, setDurationSec] = React.useState(5);
    const [generateAudio, setGenerateAudio] = React.useState(false);
    const isI2v = mode !== 't2v';
    const handleRun = React.useCallback(async () => {
        if (!asString(prompt)) {
            onStateChange((prev) => ({ ...prev, error: locale.video.promptEmpty }));
            return;
        }
        if (isI2v && !asString(refImageUri)) {
            onStateChange((prev) => ({ ...prev, error: locale.video.referenceRequired }));
            return;
        }
        onStateChange((prev) => ({ ...prev, busy: true, error: '', diagnostics: makeEmptyDiagnostics() }));
        const t0 = Date.now();
        const binding = resolveEffectiveBinding(state.snapshot, state.binding) || undefined;
        const contentItems: Array<{
            type: 'text';
            role: 'prompt';
            text: string;
        } | {
            type: 'image_url';
            role: 'reference_image' | 'first_frame';
            imageUrl: string;
        }> = [
            { type: 'text', role: 'prompt', text: prompt },
        ];
        if (isI2v && asString(refImageUri)) {
            const role = mode === 'i2v-first-frame' ? 'first_frame' : 'reference_image';
            contentItems.push({ type: 'image_url', role, imageUrl: refImageUri });
        }
        const options = {
            ratio,
            durationSec,
            generateAudio,
        };
        const requestParams: Record<string, unknown> = {
            mode, prompt, options,
            ...(refImageUri ? { refImageUri } : {}),
            content: contentItems,
            ...(binding ? { binding } : {}),
        };
        let resolved: ModRuntimeResolvedBinding | undefined;
        try {
            resolved = await runtimeClient.route.resolve({ capability: 'video.generate' as RuntimeCanonicalCapability, binding });
            const result = await runtimeClient.media.video.generate({ mode, content: contentItems, prompt, options, binding });
            const elapsed = Date.now() - t0;
            onStateChange((prev) => ({
                ...prev,
                busy: false,
                result: 'passed',
                output: result,
                rawResponse: toPrettyJson({ request: requestParams, resolved, response: stripArtifacts(result) }),
                diagnostics: {
                    requestParams,
                    resolvedRoute: resolved ?? null,
                    responseMetadata: {
                        jobId: (result.job as unknown as Record<string, unknown>)?.jobId as string | undefined,
                        artifactCount: result.artifacts?.length,
                        traceId: result.trace?.traceId,
                        modelResolved: result.trace?.modelResolved,
                        elapsed,
                    },
                },
            }));
        }
        catch (error) {
            const elapsed = Date.now() - t0;
            const baseMessage = error instanceof Error ? error.message : String(error || locale.video.failed);
            const details = (error as Record<string, unknown>)?.details as Record<string, unknown> | undefined;
            const providerMessage = details?.provider_message as string | undefined;
            const message = providerMessage ? `${baseMessage} [provider: ${providerMessage}]` : baseMessage;
            onStateChange((prev) => ({
                ...prev,
                busy: false,
                result: 'failed',
                error: message,
                rawResponse: toPrettyJson({ request: requestParams, resolved, error: message, details }),
                diagnostics: { requestParams, resolvedRoute: resolved ?? null, responseMetadata: { elapsed } },
            }));
        }
    }, [isI2v, locale, mode, prompt, refImageUri, ratio, durationSec, generateAudio, state.snapshot, state.binding, runtimeClient, onStateChange]);
    return (<div className="flex flex-col gap-3">
      <RouteBindingEditor capabilityId="video.generate" snapshot={state.snapshot} binding={state.binding} loading={state.routeLoading} error={state.routeError} onReload={onRouteReload} onBindingChange={(binding) => onStateChange((prev) => ({ ...prev, binding }))}/>
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-gray-500">{locale.video.mode}</span>
        <select className="rounded-md border border-gray-300 bg-white px-2 py-1" value={mode} onChange={(event) => setMode(event.target.value as VideoMode)}>
          <option value="t2v">{locale.video.t2v}</option>
          <option value="i2v-first-frame">{locale.video.i2vFirstFrame}</option>
          <option value="i2v-reference">{locale.video.i2vReference}</option>
        </select>
      </label>
      <textarea className="h-20 w-full resize-y rounded-lg border border-gray-300 bg-white p-2 font-mono text-xs" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={locale.video.promptPlaceholder}/>
      {isI2v ? (<input className="w-full rounded-lg border border-gray-300 bg-white p-2 font-mono text-xs" value={refImageUri} onChange={(event) => setRefImageUri(event.target.value)} placeholder={locale.video.referenceImagePlaceholder}/>) : null}
      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-gray-500">Ratio</span>
          <select className="rounded-md border border-gray-300 bg-white px-2 py-1" value={ratio} onChange={(event) => setRatio(event.target.value)}>
            <option value="16:9">16:9</option>
            <option value="9:16">9:16</option>
            <option value="1:1">1:1</option>
            <option value="4:3">4:3</option>
            <option value="3:4">3:4</option>
            <option value="21:9">21:9</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-gray-500">Duration (s)</span>
          <input type="number" min={1} max={11} className="rounded-md border border-gray-300 bg-white px-2 py-1" value={durationSec} onChange={(event) => setDurationSec(Number(event.target.value) || 5)}/>
        </label>
        <label className="flex items-center gap-1.5 text-xs pt-4">
          <input type="checkbox" checked={generateAudio} onChange={(event) => setGenerateAudio(event.target.checked)}/>
          <span className="text-gray-500">Audio</span>
        </label>
      </div>
      <RunButton busy={state.busy} label={locale.video.run} onClick={() => { void handleRun(); }}/>
      {state.error ? <ErrorBox message={state.error}/> : null}
      <DiagnosticsPanel diagnostics={state.diagnostics}/>
      {state.rawResponse ? <RawJsonSection content={state.rawResponse}/> : null}
    </div>);
}
// ── Panel: audio.synthesize ───────────────────────────────────────────────────
type AudioSynthesizePanelProps = {
    state: CapabilityState;
    runtimeClient: ModRuntimeClient;
    onStateChange: (updater: (prev: CapabilityState) => CapabilityState) => void;
    onRouteReload: () => void;
};
export function AudioSynthesizePanel(props: AudioSynthesizePanelProps) {
    const locale = useTestAiLocale();
    const { state, runtimeClient, onStateChange, onRouteReload } = props;
    const [text, setText] = React.useState<string>(locale.audioSynthesize.defaultText);
    const [voices, setVoices] = React.useState<VoiceOption[]>([]);
    const [selectedVoiceId, setSelectedVoiceId] = React.useState('');
    const [manualVoiceId, setManualVoiceId] = React.useState('');
    const [audioFormat, setAudioFormat] = React.useState('mp3');
    React.useEffect(() => {
        const effectiveBinding = resolveEffectiveBinding(state.snapshot, state.binding);
        if (!effectiveBinding) {
            setVoices([]);
            setSelectedVoiceId('');
            return;
        }
        let cancelled = false;
        void (async () => {
            try {
                const result = await runtimeClient.media.tts.listVoices({ binding: effectiveBinding });
                if (cancelled)
                    return;
                setVoices(result.voices);
                setSelectedVoiceId((prev) => {
                    if (prev && result.voices.some((v) => v.voiceId === prev))
                        return prev;
                    return result.voices[0]?.voiceId || '';
                });
            }
            catch {
                if (cancelled)
                    return;
                setVoices([]);
                setSelectedVoiceId('');
            }
        })();
        return () => { cancelled = true; };
    }, [runtimeClient, state.snapshot, state.binding]);
    const handleRun = React.useCallback(async () => {
        if (!asString(text)) {
            onStateChange((prev) => ({ ...prev, error: locale.audioSynthesize.inputEmpty }));
            return;
        }
        const voiceId = asString(manualVoiceId) || asString(selectedVoiceId);
        if (!voiceId) {
            onStateChange((prev) => ({ ...prev, error: locale.audioSynthesize.noVoiceSelected }));
            return;
        }
        const voiceRef = asString(manualVoiceId)
            ? { kind: 'provider_voice_ref' as const, providerVoiceRef: voiceId }
            : { kind: 'preset_voice_id' as const, presetVoiceId: voiceId };
        onStateChange((prev) => ({ ...prev, busy: true, error: '', diagnostics: makeEmptyDiagnostics() }));
        const t0 = Date.now();
        const binding = resolveEffectiveBinding(state.snapshot, state.binding) || undefined;
        const requestParams: Record<string, unknown> = { text, voiceRef, audioFormat, ...(binding ? { binding } : {}) };
        let resolved: ModRuntimeResolvedBinding | undefined;
        try {
            resolved = await runtimeClient.route.resolve({ capability: 'audio.synthesize', binding });
            const result = await runtimeClient.media.tts.synthesize({ text, voiceRef, audioFormat, binding });
            const elapsed = Date.now() - t0;
            const artifact = result.artifacts[0];
            const audioUri = toArtifactPreviewUri({ uri: artifact?.uri, bytes: artifact?.bytes, mimeType: artifact?.mimeType });
            onStateChange((prev) => ({
                ...prev,
                busy: false,
                result: 'passed',
                output: { audioUri, mimeType: asString(artifact?.mimeType), durationMs: Number(artifact?.durationMs || 0) },
                rawResponse: toPrettyJson({ request: requestParams, resolved, response: stripArtifacts(result) }),
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
            const message = error instanceof Error ? error.message : String(error || locale.audioSynthesize.failed);
            onStateChange((prev) => ({
                ...prev,
                busy: false,
                result: 'failed',
                error: message,
                rawResponse: toPrettyJson({ request: requestParams, resolved, error: message }),
                diagnostics: { requestParams, resolvedRoute: resolved ?? null, responseMetadata: { elapsed } },
            }));
        }
    }, [audioFormat, locale, manualVoiceId, onStateChange, runtimeClient, selectedVoiceId, state.binding, state.snapshot, text]);
    const audioOutput = state.output as {
        audioUri?: string;
        mimeType?: string;
        durationMs?: number;
    } | null;
    return (<div className="flex flex-col gap-3">
      <RouteBindingEditor capabilityId="audio.synthesize" snapshot={state.snapshot} binding={state.binding} loading={state.routeLoading} error={state.routeError} onReload={onRouteReload} onBindingChange={(binding) => onStateChange((prev) => ({ ...prev, binding }))}/>
      <textarea className="h-20 w-full resize-y rounded-lg border border-gray-300 bg-white p-2 font-mono text-xs" value={text} onChange={(event) => setText(event.target.value)} placeholder={locale.audioSynthesize.textPlaceholder}/>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-gray-500">{locale.audioSynthesize.presetVoice}</span>
          <select className="rounded-md border border-gray-300 bg-white px-2 py-1" value={selectedVoiceId} onChange={(event) => setSelectedVoiceId(event.target.value)}>
            <option value="">{locale.common.none}</option>
            {voices.map((voice) => (<option key={voice.voiceId} value={voice.voiceId}>
                {voice.name} [{voice.lang}]
              </option>))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-gray-500">{locale.audioSynthesize.audioFormat}</span>
          <select className="rounded-md border border-gray-300 bg-white px-2 py-1" value={audioFormat} onChange={(event) => setAudioFormat(event.target.value)}>
            <option value="mp3">mp3</option>
            <option value="wav">wav</option>
            <option value="ogg">ogg</option>
            <option value="pcm">pcm</option>
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-gray-500">{locale.audioSynthesize.manualVoiceOverride}</span>
        <input className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs" value={manualVoiceId} onChange={(event) => setManualVoiceId(event.target.value)} placeholder={locale.audioSynthesize.manualVoicePlaceholder}/>
      </label>
      <RunButton busy={state.busy} label={locale.audioSynthesize.run} onClick={() => { void handleRun(); }}/>
      {state.error ? <ErrorBox message={state.error}/> : null}
      {audioOutput?.audioUri ? (<div>
          <audio controls className="w-full" src={audioOutput.audioUri}/>
          <div className="mt-1 text-xs text-gray-500">
            {audioOutput.mimeType || locale.common.audio} · {audioOutput.durationMs ? `${audioOutput.durationMs}ms` : locale.common.durationUnknown}
          </div>
        </div>) : null}
      <DiagnosticsPanel diagnostics={state.diagnostics}/>
      {state.rawResponse ? <RawJsonSection content={state.rawResponse}/> : null}
    </div>);
}
// ── Panel: audio.transcribe ───────────────────────────────────────────────────
type AudioTranscribePanelProps = {
    state: CapabilityState;
    runtimeClient: ModRuntimeClient;
    onStateChange: (updater: (prev: CapabilityState) => CapabilityState) => void;
    onRouteReload: () => void;
};
export function AudioTranscribePanel(props: AudioTranscribePanelProps) {
    const locale = useTestAiLocale();
    const { state, runtimeClient, onStateChange, onRouteReload } = props;
    const [audioUri, setAudioUri] = React.useState('');
    const [language, setLanguage] = React.useState('');
    const [mimeType, setMimeType] = React.useState('');
    const handleRun = React.useCallback(async () => {
        if (!asString(audioUri)) {
            onStateChange((prev) => ({ ...prev, error: locale.audioTranscribe.audioUrlEmpty }));
            return;
        }
        onStateChange((prev) => ({ ...prev, busy: true, error: '', diagnostics: makeEmptyDiagnostics() }));
        const t0 = Date.now();
        const binding = resolveEffectiveBinding(state.snapshot, state.binding) || undefined;
        const requestParams: Record<string, unknown> = {
            audio: { kind: 'url', url: audioUri },
            ...(language ? { language } : {}),
            ...(mimeType ? { mimeType } : {}),
            ...(binding ? { binding } : {}),
        };
        let resolved: ModRuntimeResolvedBinding | undefined;
        try {
            resolved = await runtimeClient.route.resolve({ capability: 'audio.transcribe' as RuntimeCanonicalCapability, binding });
            const result = await runtimeClient.media.stt.transcribe({
                audio: { kind: 'url', url: audioUri },
                ...(language ? { language } : {}),
                ...(mimeType ? { mimeType } : {}),
                binding,
            });
            const elapsed = Date.now() - t0;
            onStateChange((prev) => ({
                ...prev,
                busy: false,
                result: 'passed',
                output: result.text || locale.audioTranscribe.noTranscription,
                rawResponse: toPrettyJson({ request: requestParams, resolved, response: result }),
                diagnostics: {
                    requestParams,
                    resolvedRoute: resolved ?? null,
                    responseMetadata: {
                        jobId: (result.job as unknown as Record<string, unknown>)?.jobId as string | undefined,
                        traceId: result.trace?.traceId,
                        modelResolved: result.trace?.modelResolved,
                        elapsed,
                    },
                },
            }));
        }
        catch (error) {
            const elapsed = Date.now() - t0;
            const message = error instanceof Error ? error.message : String(error || locale.audioTranscribe.failed);
            onStateChange((prev) => ({
                ...prev,
                busy: false,
                result: 'failed',
                error: message,
                rawResponse: toPrettyJson({ request: requestParams, resolved, error: message }),
                diagnostics: { requestParams, resolvedRoute: resolved ?? null, responseMetadata: { elapsed } },
            }));
        }
    }, [audioUri, language, locale, mimeType, onStateChange, runtimeClient, state.binding, state.snapshot]);
    return (<div className="flex flex-col gap-3">
      <RouteBindingEditor capabilityId="audio.transcribe" snapshot={state.snapshot} binding={state.binding} loading={state.routeLoading} error={state.routeError} onReload={onRouteReload} onBindingChange={(binding) => onStateChange((prev) => ({ ...prev, binding }))}/>
      <input className="w-full rounded-lg border border-gray-300 bg-white p-2 font-mono text-xs" value={audioUri} onChange={(event) => setAudioUri(event.target.value)} placeholder={locale.audioTranscribe.audioUrlPlaceholder}/>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-gray-500">{locale.audioTranscribe.language}</span>
          <input className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs" value={language} onChange={(event) => setLanguage(event.target.value)} placeholder={locale.audioTranscribe.languagePlaceholder}/>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-gray-500">{locale.audioTranscribe.mimeType}</span>
          <input className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs" value={mimeType} onChange={(event) => setMimeType(event.target.value)} placeholder={locale.audioTranscribe.mimeTypePlaceholder}/>
        </label>
      </div>
      <RunButton busy={state.busy} label={locale.audioTranscribe.run} onClick={() => { void handleRun(); }}/>
      {state.error ? <ErrorBox message={state.error}/> : null}
      {state.output ? (<pre className="max-h-48 overflow-auto rounded-md bg-gray-50 p-2 text-xs">{asString(state.output)}</pre>) : null}
      <DiagnosticsPanel diagnostics={state.diagnostics}/>
      {state.rawResponse ? <RawJsonSection content={state.rawResponse}/> : null}
    </div>);
}
// ── Panel: voice.clone ────────────────────────────────────────────────────────
type VoiceClonePanelProps = {
    state: CapabilityState;
    onStateChange: (updater: (prev: CapabilityState) => CapabilityState) => void;
};
export function VoiceClonePanel(props: VoiceClonePanelProps) {
    const locale = useTestAiLocale();
    const { state, onStateChange } = props;
    const [refAudioUri, setRefAudioUri] = React.useState('');
    const [targetModel, setTargetModel] = React.useState('');
    const handleRun = React.useCallback(() => {
        const requestParams: Record<string, unknown> = { refAudioUri, targetModel };
        onStateChange((prev) => ({
            ...prev,
            result: 'failed',
            error: locale.voiceClone.error,
            rawResponse: toPrettyJson({ error: locale.voiceClone.sdkMethodUnavailable, capability: 'runtime.media.voice.clone', requestParams }),
            diagnostics: { requestParams, resolvedRoute: null, responseMetadata: null },
        }));
    }, [locale, onStateChange, refAudioUri, targetModel]);
    return (<div className="flex flex-col gap-3">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
        {locale.voiceClone.banner}
      </div>
      <input className="w-full rounded-lg border border-gray-300 bg-white p-2 font-mono text-xs" value={refAudioUri} onChange={(event) => setRefAudioUri(event.target.value)} placeholder={locale.voiceClone.refAudioPlaceholder}/>
      <input className="w-full rounded-lg border border-gray-300 bg-white p-2 font-mono text-xs" value={targetModel} onChange={(event) => setTargetModel(event.target.value)} placeholder={locale.voiceClone.targetModelPlaceholder}/>
      <RunButton busy={state.busy} label={locale.voiceClone.run} onClick={() => { void handleRun(); }}/>
      {state.error ? <ErrorBox message={state.error}/> : null}
      {state.rawResponse ? <RawJsonSection content={state.rawResponse}/> : null}
    </div>);
}
// ── Panel: voice.design ───────────────────────────────────────────────────────
type VoiceDesignPanelProps = {
    state: CapabilityState;
    onStateChange: (updater: (prev: CapabilityState) => CapabilityState) => void;
};
export function VoiceDesignPanel(props: VoiceDesignPanelProps) {
    const locale = useTestAiLocale();
    const { state, onStateChange } = props;
    const [instruction, setInstruction] = React.useState('');
    const handleRun = React.useCallback(() => {
        const requestParams: Record<string, unknown> = { instruction };
        onStateChange((prev) => ({
            ...prev,
            result: 'failed',
            error: locale.voiceDesign.error,
            rawResponse: toPrettyJson({ error: locale.voiceDesign.sdkMethodUnavailable, capability: 'runtime.media.voice.design', requestParams }),
            diagnostics: { requestParams, resolvedRoute: null, responseMetadata: null },
        }));
    }, [instruction, locale, onStateChange]);
    return (<div className="flex flex-col gap-3">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
        {locale.voiceDesign.banner}
      </div>
      <textarea className="h-20 w-full resize-y rounded-lg border border-gray-300 bg-white p-2 font-mono text-xs" value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder={locale.voiceDesign.instructionPlaceholder}/>
      <RunButton busy={state.busy} label={locale.voiceDesign.run} onClick={() => { void handleRun(); }}/>
      {state.error ? <ErrorBox message={state.error}/> : null}
      {state.rawResponse ? <RawJsonSection content={state.rawResponse}/> : null}
    </div>);
}
