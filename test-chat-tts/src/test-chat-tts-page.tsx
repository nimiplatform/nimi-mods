import React from 'react';
import type {
  ModRuntimeResolvedBinding,
  ModRuntimeClient,
} from '@nimiplatform/sdk/mod/runtime';
import type {
  RuntimeCanonicalCapability,
  RuntimeRouteBinding,
  RuntimeRouteOptionsSnapshot,
  RuntimeRouteSource,
} from '@nimiplatform/sdk/mod/runtime-route';
import { getTestChatTtsRuntimeClient } from './runtime-mod.js';

type RouteSummary = {
  source: string;
  model: string;
  provider: string;
  connectorId: string;
};

type VoiceOption = {
  voiceId: string;
  name: string;
  lang: string;
  supportedLangs: string[];
};

type CapabilitySection = {
  snapshot: RuntimeRouteOptionsSnapshot | null;
  binding: RuntimeRouteBinding | null;
  loading: boolean;
  error: string;
};

function asString(value: unknown): string {
  return String(value || '').trim();
}

function toPrettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return String(error || 'JSON stringify failed');
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const value of bytes) {
    binary += String.fromCharCode(value);
  }
  return window.btoa(binary);
}

function toArtifactPreviewUri(input: { uri?: string; bytes?: Uint8Array; mimeType?: string }): string {
  const uri = asString(input.uri);
  if (uri) return uri;
  if (input.bytes && input.bytes.length > 0) {
    const mimeType = asString(input.mimeType) || 'application/octet-stream';
    return `data:${mimeType};base64,${bytesToBase64(input.bytes)}`;
  }
  return '';
}

function resolveEffectiveBinding(
  snapshot: RuntimeRouteOptionsSnapshot | null,
  binding: RuntimeRouteBinding | null,
): RuntimeRouteBinding | null {
  if (binding) {
    return binding;
  }
  if (!snapshot) {
    return null;
  }
  return snapshot.selected || snapshot.resolvedDefault || null;
}

function firstLocalBinding(snapshot: RuntimeRouteOptionsSnapshot | null): RuntimeRouteBinding | null {
  const local = snapshot?.localRuntime.models[0] || null;
  if (!local) {
    return null;
  }
  return {
    source: 'local-runtime',
    connectorId: '',
    model: local.model,
    localModelId: local.localModelId,
    engine: local.engine,
  };
}

function firstTokenBinding(snapshot: RuntimeRouteOptionsSnapshot | null): RuntimeRouteBinding | null {
  const connector = snapshot?.connectors[0] || null;
  if (!connector) {
    return null;
  }
  return {
    source: 'token-api',
    connectorId: connector.id,
    model: connector.models[0] || '',
  };
}

function bindingForSource(
  snapshot: RuntimeRouteOptionsSnapshot | null,
  source: RuntimeRouteSource,
): RuntimeRouteBinding | null {
  return source === 'token-api' ? firstTokenBinding(snapshot) : firstLocalBinding(snapshot);
}

function bindingForConnector(
  snapshot: RuntimeRouteOptionsSnapshot | null,
  connectorId: string,
  current: RuntimeRouteBinding | null,
): RuntimeRouteBinding | null {
  const connector = snapshot?.connectors.find((item) => item.id === connectorId) || null;
  if (!connector) {
    return null;
  }
  const currentModel = current?.source === 'token-api' ? current.model : '';
  const model = connector.models.includes(currentModel) ? currentModel : (connector.models[0] || '');
  return {
    source: 'token-api',
    connectorId: connector.id,
    model,
  };
}

function bindingForModel(
  snapshot: RuntimeRouteOptionsSnapshot | null,
  model: string,
  current: RuntimeRouteBinding | null,
): RuntimeRouteBinding | null {
  const normalizedModel = asString(model);
  if (!normalizedModel) {
    return current;
  }
  const effective = resolveEffectiveBinding(snapshot, current);
  if (!effective) {
    return null;
  }
  if (effective.source === 'token-api') {
    return {
      source: 'token-api',
      connectorId: effective.connectorId,
      model: normalizedModel,
    };
  }
  const localModel = snapshot?.localRuntime.models.find((item) => item.model === normalizedModel) || null;
  return {
    source: 'local-runtime',
    connectorId: '',
    model: normalizedModel,
    localModelId: localModel?.localModelId,
    engine: localModel?.engine,
  };
}

function toRouteSummary(binding: ModRuntimeResolvedBinding): RouteSummary {
  return {
    source: binding.source,
    model: binding.model,
    provider: binding.provider,
    connectorId: binding.connectorId,
  };
}

type RouteBindingEditorProps = {
  title: string;
  snapshot: RuntimeRouteOptionsSnapshot | null;
  binding: RuntimeRouteBinding | null;
  loading: boolean;
  error: string;
  onReload: () => void;
  onBindingChange: (binding: RuntimeRouteBinding | null) => void;
};

function RouteBindingEditor(props: RouteBindingEditorProps) {
  const effectiveBinding = resolveEffectiveBinding(props.snapshot, props.binding);
  const activeSource = effectiveBinding?.source || props.snapshot?.selected.source || 'local-runtime';
  const activeConnectorId = effectiveBinding?.connectorId || props.snapshot?.selected.connectorId || '';
  const activeConnector = props.snapshot?.connectors.find((item) => item.id === activeConnectorId) || null;
  const activeModel = effectiveBinding?.model || props.snapshot?.selected.model || '';
  const localModels = props.snapshot?.localRuntime.models || [];
  const tokenConnectors = props.snapshot?.connectors || [];
  const modelOptions = activeSource === 'local-runtime'
    ? localModels.map((item) => item.model)
    : (activeConnector?.models || []);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{props.title}</h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs"
            disabled={props.loading}
            onClick={props.onReload}
          >
            {props.loading ? 'Refreshing...' : 'Refresh'}
          </button>
          <button
            type="button"
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs"
            onClick={() => props.onBindingChange(null)}
          >
            Use runtime default
          </button>
        </div>
      </div>
      {props.error ? (
        <div className="mb-2 rounded-md bg-amber-50 p-2 text-xs text-amber-700">{props.error}</div>
      ) : null}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs">
          <span>Source</span>
          <select
            className="rounded-md border border-gray-300 bg-white px-2 py-1"
            value={activeSource}
            onChange={(event) => {
              props.onBindingChange(bindingForSource(props.snapshot, event.target.value as RuntimeRouteSource));
            }}
            disabled={!props.snapshot}
          >
            <option value="local-runtime">local-runtime</option>
            <option value="token-api">token-api</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span>Connector</span>
          <select
            className="rounded-md border border-gray-300 bg-white px-2 py-1"
            value={activeSource === 'token-api' ? activeConnectorId : ''}
            onChange={(event) => {
              props.onBindingChange(bindingForConnector(props.snapshot, event.target.value, effectiveBinding));
            }}
            disabled={!props.snapshot || activeSource !== 'token-api'}
          >
            <option value="">--</option>
            {tokenConnectors.map((connector) => (
              <option key={connector.id} value={connector.id}>
                {connector.label || connector.id}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span>Model</span>
          <input
            list={`test-chat-tts-${props.title}-models`}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs"
            value={activeModel}
            onChange={(event) => {
              props.onBindingChange(bindingForModel(props.snapshot, event.target.value, effectiveBinding));
            }}
            disabled={!props.snapshot}
            placeholder="model id"
          />
          <datalist id={`test-chat-tts-${props.title}-models`}>
            {modelOptions.map((model) => (
              <option key={model} value={model} />
            ))}
          </datalist>
        </label>
      </div>
      <div className="mt-2 text-xs text-gray-600">
        Selected: {effectiveBinding ? `${effectiveBinding.source} | ${effectiveBinding.connectorId || '-'} | ${effectiveBinding.model || '-'}` : 'runtime default'}
      </div>
    </div>
  );
}

async function loadCapabilitySnapshot(input: {
  runtimeClient: ModRuntimeClient;
  capability: RuntimeCanonicalCapability;
  setSection: React.Dispatch<React.SetStateAction<CapabilitySection>>;
}): Promise<void> {
  input.setSection((previous) => ({
    ...previous,
    loading: true,
    error: '',
  }));
  try {
    const snapshot = await input.runtimeClient.route.listOptions({
      capability: input.capability,
    });
    input.setSection((previous) => ({
      ...previous,
      snapshot,
      loading: false,
      error: '',
      binding: previous.binding || null,
    }));
  } catch (error) {
    input.setSection((previous) => ({
      ...previous,
      loading: false,
      error: error instanceof Error ? error.message : String(error || 'Failed to load route options.'),
    }));
  }
}

export function TestChatTtsPage() {
  const runtimeClient = React.useMemo(() => getTestChatTtsRuntimeClient(), []);

  const [chatSection, setChatSection] = React.useState<CapabilitySection>({
    snapshot: null,
    binding: null,
    loading: false,
    error: '',
  });
  const [imageSection, setImageSection] = React.useState<CapabilitySection>({
    snapshot: null,
    binding: null,
    loading: false,
    error: '',
  });
  const [ttsSection, setTtsSection] = React.useState<CapabilitySection>({
    snapshot: null,
    binding: null,
    loading: false,
    error: '',
  });

  const [chatInput, setChatInput] = React.useState('你好，请用两句话介绍你自己。');
  const [chatBusy, setChatBusy] = React.useState(false);
  const [chatError, setChatError] = React.useState('');
  const [chatOutput, setChatOutput] = React.useState('');
  const [chatRawResponse, setChatRawResponse] = React.useState('');
  const [chatRouteSummary, setChatRouteSummary] = React.useState<RouteSummary | null>(null);

  const [imagePrompt, setImagePrompt] = React.useState('一只穿宇航服的橘猫，电影感，细节丰富');
  const [imageNegativePrompt, setImageNegativePrompt] = React.useState('low quality, blurry');
  const [imageBusy, setImageBusy] = React.useState(false);
  const [imageError, setImageError] = React.useState('');
  const [imageRawResponse, setImageRawResponse] = React.useState('');
  const [imageOutputUris, setImageOutputUris] = React.useState<string[]>([]);
  const [imageRouteSummary, setImageRouteSummary] = React.useState<RouteSummary | null>(null);

  const [ttsInput, setTtsInput] = React.useState('这是一个 TTS 链路测试。');
  const [ttsBusy, setTtsBusy] = React.useState(false);
  const [ttsError, setTtsError] = React.useState('');
  const [ttsRawResponse, setTtsRawResponse] = React.useState('');
  const [voices, setVoices] = React.useState<VoiceOption[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = React.useState('');
  const [manualVoiceId, setManualVoiceId] = React.useState('');
  const [audioUri, setAudioUri] = React.useState('');
  const [audioMeta, setAudioMeta] = React.useState<{ mimeType: string; durationMs: number }>({
    mimeType: '',
    durationMs: 0,
  });

  const refreshChatOptions = React.useCallback(async () => {
    await loadCapabilitySnapshot({
      runtimeClient,
      capability: 'text.generate',
      setSection: setChatSection,
    });
  }, [runtimeClient]);

  const refreshImageOptions = React.useCallback(async () => {
    await loadCapabilitySnapshot({
      runtimeClient,
      capability: 'image.generate',
      setSection: setImageSection,
    });
  }, [runtimeClient]);

  const refreshTtsOptions = React.useCallback(async () => {
    await loadCapabilitySnapshot({
      runtimeClient,
      capability: 'audio.synthesize',
      setSection: setTtsSection,
    });
  }, [runtimeClient]);

  React.useEffect(() => {
    void Promise.all([
      refreshChatOptions(),
      refreshImageOptions(),
      refreshTtsOptions(),
    ]);
  }, [refreshChatOptions, refreshImageOptions, refreshTtsOptions]);

  React.useEffect(() => {
    const effectiveBinding = resolveEffectiveBinding(ttsSection.snapshot, ttsSection.binding);
    if (!effectiveBinding) {
      setVoices([]);
      setSelectedVoiceId('');
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const result = await runtimeClient.media.tts.listVoices({
          binding: effectiveBinding,
        });
        if (cancelled) return;
        setVoices(result.voices);
        setSelectedVoiceId((previous) => {
          if (previous && result.voices.some((voice) => voice.voiceId === previous)) {
            return previous;
          }
          return result.voices[0]?.voiceId || '';
        });
      } catch (error) {
        if (cancelled) return;
        setVoices([]);
        setSelectedVoiceId('');
        setTtsError(error instanceof Error ? error.message : String(error || 'Failed to load voices.'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runtimeClient, ttsSection.binding, ttsSection.snapshot]);

  const handleChatTest = React.useCallback(async () => {
    const prompt = asString(chatInput);
    if (!prompt) {
      setChatError('Chat prompt is empty.');
      return;
    }
    setChatBusy(true);
    setChatError('');
    try {
      const binding = resolveEffectiveBinding(chatSection.snapshot, chatSection.binding) || undefined;
      const resolved = await runtimeClient.route.resolve({
        capability: 'text.generate',
        binding,
      });
      const result = await runtimeClient.ai.text.generate({
        input: prompt,
        binding,
      });
      setChatRouteSummary(toRouteSummary(resolved));
      setChatOutput(asString(result.text) || '(empty output)');
      setChatRawResponse(toPrettyJson({
        request: { prompt, binding: binding || null },
        resolved,
        response: result,
      }));
      if (!asString(ttsInput) && asString(result.text)) {
        setTtsInput(result.text);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || 'Chat test failed.');
      setChatError(message);
      setChatRawResponse(toPrettyJson({ error: message }));
    } finally {
      setChatBusy(false);
    }
  }, [chatInput, chatSection.binding, chatSection.snapshot, runtimeClient, ttsInput]);

  const handleImageTest = React.useCallback(async () => {
    const prompt = asString(imagePrompt);
    if (!prompt) {
      setImageError('Image prompt is empty.');
      return;
    }
    setImageBusy(true);
    setImageError('');
    try {
      const binding = resolveEffectiveBinding(imageSection.snapshot, imageSection.binding) || undefined;
      const resolved = await runtimeClient.route.resolve({
        capability: 'image.generate',
        binding,
      });
      const result = await runtimeClient.media.image.generate({
        prompt,
        negativePrompt: asString(imageNegativePrompt) || undefined,
        n: 1,
        size: '1024x1024',
        responseFormat: 'url',
        binding,
      });
      const uris = result.artifacts
        .map((artifact) => toArtifactPreviewUri({
          uri: artifact.uri,
          bytes: artifact.bytes,
          mimeType: artifact.mimeType,
        }))
        .filter(Boolean);
      setImageRouteSummary(toRouteSummary(resolved));
      setImageOutputUris(uris);
      setImageRawResponse(toPrettyJson({
        request: { prompt, negativePrompt: imageNegativePrompt, binding: binding || null },
        resolved,
        response: result,
        previewUris: uris,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || 'Image test failed.');
      setImageError(message);
      setImageRawResponse(toPrettyJson({ error: message }));
      setImageOutputUris([]);
    } finally {
      setImageBusy(false);
    }
  }, [imageNegativePrompt, imagePrompt, imageSection.binding, imageSection.snapshot, runtimeClient]);

  const handleTtsTest = React.useCallback(async () => {
    const text = asString(ttsInput);
    if (!text) {
      setTtsError('TTS input is empty.');
      return;
    }
    const voice = asString(manualVoiceId) || asString(selectedVoiceId);
    if (!voice) {
      setTtsError('No voice selected.');
      return;
    }
    setTtsBusy(true);
    setTtsError('');
    try {
      const binding = resolveEffectiveBinding(ttsSection.snapshot, ttsSection.binding) || undefined;
      const resolved = await runtimeClient.route.resolve({
        capability: 'audio.synthesize',
        binding,
      });
      const result = await runtimeClient.media.tts.synthesize({
        text,
        voice,
        audioFormat: 'mp3',
        binding,
      });
      const artifact = result.artifacts[0];
      setAudioUri(toArtifactPreviewUri({
        uri: artifact?.uri,
        bytes: artifact?.bytes,
        mimeType: artifact?.mimeType,
      }));
      setAudioMeta({
        mimeType: asString(artifact?.mimeType),
        durationMs: Number(artifact?.durationMs || 0),
      });
      setTtsRawResponse(toPrettyJson({
        request: { text, voice, binding: binding || null },
        resolved,
        response: result,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || 'TTS test failed.');
      setTtsError(message);
      setTtsRawResponse(toPrettyJson({ error: message }));
    } finally {
      setTtsBusy(false);
    }
  }, [manualVoiceId, runtimeClient, selectedVoiceId, ttsInput, ttsSection.binding, ttsSection.snapshot]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto bg-gray-50 p-4 text-sm text-gray-900">
      <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-lg font-semibold">Test Chat + Image + TTS</h2>
        <p className="mt-1 text-xs text-gray-600">
          Runtime-aligned diagnostics surface: capability-scoped binding selection, chat/image execution, and TTS voice resolution.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <RouteBindingEditor
          title="Chat Binding"
          snapshot={chatSection.snapshot}
          binding={chatSection.binding}
          loading={chatSection.loading}
          error={chatSection.error}
          onReload={() => { void refreshChatOptions(); }}
          onBindingChange={(binding) => {
            setChatSection((previous) => ({ ...previous, binding }));
          }}
        />
        <RouteBindingEditor
          title="Image Binding"
          snapshot={imageSection.snapshot}
          binding={imageSection.binding}
          loading={imageSection.loading}
          error={imageSection.error}
          onReload={() => { void refreshImageOptions(); }}
          onBindingChange={(binding) => {
            setImageSection((previous) => ({ ...previous, binding }));
          }}
        />
        <RouteBindingEditor
          title="TTS Binding"
          snapshot={ttsSection.snapshot}
          binding={ttsSection.binding}
          loading={ttsSection.loading}
          error={ttsSection.error}
          onReload={() => { void refreshTtsOptions(); }}
          onBindingChange={(binding) => {
            setTtsSection((previous) => ({ ...previous, binding }));
          }}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold">Chat Test</h3>
          <textarea
            className="h-28 w-full resize-y rounded-lg border border-gray-300 bg-white p-2 font-mono text-xs"
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
          />
          <button
            type="button"
            className="mt-2 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            disabled={chatBusy}
            onClick={() => { void handleChatTest(); }}
          >
            {chatBusy ? 'Running...' : 'Run Chat Test'}
          </button>
          {chatError ? <div className="mt-2 rounded-md bg-red-50 p-2 text-xs text-red-700">{chatError}</div> : null}
          <div className="mt-2 text-xs text-gray-600">
            Route: {chatRouteSummary ? `${chatRouteSummary.source} | ${chatRouteSummary.provider} | ${chatRouteSummary.model}` : 'n/a'}
          </div>
          <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-gray-50 p-2 text-xs">{chatOutput || '(no output yet)'}</pre>
          <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-gray-50 p-2 text-xs">{chatRawResponse || '(no response yet)'}</pre>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold">Image Test</h3>
          <textarea
            className="h-20 w-full resize-y rounded-lg border border-gray-300 bg-white p-2 font-mono text-xs"
            value={imagePrompt}
            onChange={(event) => setImagePrompt(event.target.value)}
          />
          <textarea
            className="mt-2 h-16 w-full resize-y rounded-lg border border-gray-300 bg-white p-2 font-mono text-xs"
            value={imageNegativePrompt}
            onChange={(event) => setImageNegativePrompt(event.target.value)}
            placeholder="Negative prompt"
          />
          <button
            type="button"
            className="mt-2 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            disabled={imageBusy}
            onClick={() => { void handleImageTest(); }}
          >
            {imageBusy ? 'Running...' : 'Run Image Test'}
          </button>
          {imageError ? <div className="mt-2 rounded-md bg-red-50 p-2 text-xs text-red-700">{imageError}</div> : null}
          <div className="mt-2 text-xs text-gray-600">
            Route: {imageRouteSummary ? `${imageRouteSummary.source} | ${imageRouteSummary.provider} | ${imageRouteSummary.model}` : 'n/a'}
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2">
            {imageOutputUris.map((uri) => (
              <img key={uri} alt="Generated preview" src={uri} className="rounded-lg border border-gray-200" />
            ))}
          </div>
          <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-gray-50 p-2 text-xs">{imageRawResponse || '(no response yet)'}</pre>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold">TTS Test</h3>
          <textarea
            className="h-20 w-full resize-y rounded-lg border border-gray-300 bg-white p-2 font-mono text-xs"
            value={ttsInput}
            onChange={(event) => setTtsInput(event.target.value)}
          />
          <label className="mt-2 flex flex-col gap-1 text-xs">
            <span>Preset Voice</span>
            <select
              className="rounded-md border border-gray-300 bg-white px-2 py-1"
              value={selectedVoiceId}
              onChange={(event) => setSelectedVoiceId(event.target.value)}
            >
              <option value="">--</option>
              {voices.map((voice) => (
                <option key={voice.voiceId} value={voice.voiceId}>
                  {voice.name} [{voice.lang}]
                </option>
              ))}
            </select>
          </label>
          <label className="mt-2 flex flex-col gap-1 text-xs">
            <span>Manual Voice Override</span>
            <input
              className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs"
              value={manualVoiceId}
              onChange={(event) => setManualVoiceId(event.target.value)}
              placeholder="voice id"
            />
          </label>
          <button
            type="button"
            className="mt-2 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            disabled={ttsBusy}
            onClick={() => { void handleTtsTest(); }}
          >
            {ttsBusy ? 'Running...' : 'Run TTS Test'}
          </button>
          {ttsError ? <div className="mt-2 rounded-md bg-red-50 p-2 text-xs text-red-700">{ttsError}</div> : null}
          {audioUri ? (
            <div className="mt-2">
              <audio controls className="w-full" src={audioUri} />
              <div className="mt-1 text-xs text-gray-600">
                {audioMeta.mimeType || 'audio'} · {audioMeta.durationMs ? `${audioMeta.durationMs}ms` : 'duration unknown'}
              </div>
            </div>
          ) : null}
          <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-gray-50 p-2 text-xs">{ttsRawResponse || '(no response yet)'}</pre>
        </section>
      </div>
    </div>
  );
}
