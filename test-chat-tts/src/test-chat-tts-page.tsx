import React from 'react';
import type {
  HookSpeechProviderDescriptor,
  HookSpeechVoiceDescriptor,
  RuntimeRouteOverride,
} from '@nimiplatform/sdk/mod/types';
import {
  parseRuntimeRouteOptions,
  type RuntimeRouteOptionsSnapshot,
} from '@nimiplatform/sdk/mod/runtime-route';
import {
  TEST_CHAT_TTS_DATA_API_RUNTIME_ROUTE_OPTIONS,
  TEST_CHAT_TTS_MOD_ID,
} from './contracts.js';
import { getTestChatTtsAiClient, getTestChatTtsHookClient } from './runtime-mod.js';

type RouteSummary = {
  source: string;
  model: string;
  provider: string;
};

type RouteSourceOverride = '' | 'local-runtime' | 'token-api';
type ImageMode = 't2i' | 'i2i';
const ROUTE_OPTIONS_QUERY_TIMEOUT_MS = 6000;

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

function splitTrimmedLines(value: string): string[] {
  return String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function toImagePreviewUri(image: { uri?: string; b64Json?: string; mimeType?: string }): string {
  const uri = asString(image.uri);
  if (uri) return uri;
  const b64 = asString(image.b64Json);
  if (!b64) return '';
  const mimeType = asString(image.mimeType) || 'image/png';
  return `data:${mimeType};base64,${b64}`;
}

function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = asString(reader.result);
      if (!result) {
        reject(new Error(`Failed to read file: ${file.name}`));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => {
      reject(new Error(`Failed to read file: ${file.name}`));
    };
    reader.readAsDataURL(file);
  });
}

function compactImageRefForLog(value: string): string {
  const normalized = asString(value);
  if (!normalized) return '';
  if (!normalized.startsWith('data:')) return normalized;
  const commaIndex = normalized.indexOf(',');
  if (commaIndex <= 0) {
    return `${normalized.slice(0, 48)}...(len=${normalized.length})`;
  }
  const header = normalized.slice(0, Math.min(commaIndex + 1, 72));
  return `${header}...(len=${normalized.length})`;
}

export function TestChatTtsPage() {
  const aiClient = React.useMemo(() => getTestChatTtsAiClient(), []);
  const hookClient = React.useMemo(() => getTestChatTtsHookClient(), []);

  const [chatInput, setChatInput] = React.useState('你好，请用两句话介绍你自己。');
  const [chatBusy, setChatBusy] = React.useState(false);
  const [chatError, setChatError] = React.useState('');
  const [chatOutput, setChatOutput] = React.useState('');
  const [chatRawResponse, setChatRawResponse] = React.useState('');
  const [routeSummary, setRouteSummary] = React.useState<RouteSummary | null>(null);
  const [routeSourceOverride, setRouteSourceOverride] = React.useState<RouteSourceOverride>('');
  const [routeConnectorIdOverride, setRouteConnectorIdOverride] = React.useState('');
  const [routeModelOverride, setRouteModelOverride] = React.useState('');
  const [routeOptions, setRouteOptions] = React.useState<RuntimeRouteOptionsSnapshot | null>(null);
  const [routeOptionsBusy, setRouteOptionsBusy] = React.useState(false);
  const [routeOptionsError, setRouteOptionsError] = React.useState('');

  const [ttsInput, setTtsInput] = React.useState('这是一个 TTS 链路测试。');
  const [ttsBusy, setTtsBusy] = React.useState(false);
  const [ttsError, setTtsError] = React.useState('');
  const [ttsRawResponse, setTtsRawResponse] = React.useState('');
  const [providers, setProviders] = React.useState<HookSpeechProviderDescriptor[]>([]);
  const [voices, setVoices] = React.useState<HookSpeechVoiceDescriptor[]>([]);
  const [selectedProviderId, setSelectedProviderId] = React.useState('');
  const [selectedVoiceId, setSelectedVoiceId] = React.useState('');
  const [manualVoiceId, setManualVoiceId] = React.useState('');
  const [audioUri, setAudioUri] = React.useState('');
  const [audioMeta, setAudioMeta] = React.useState<{ mimeType: string; durationMs: number }>({
    mimeType: '',
    durationMs: 0,
  });

  const [imageMode, setImageMode] = React.useState<ImageMode>('t2i');
  const [imagePrompt, setImagePrompt] = React.useState('一只穿宇航服的橘猫，电影感，细节丰富');
  const [imageNegativePrompt, setImageNegativePrompt] = React.useState('low quality, blurry');
  const [imageModel, setImageModel] = React.useState('');
  const [imageSize, setImageSize] = React.useState('1024x1024');
  const [imageCount, setImageCount] = React.useState('1');
  const [imageResponseFormat, setImageResponseFormat] = React.useState<'url' | 'base64'>('url');
  const [imageSource, setImageSource] = React.useState('');
  const [imageSourceUploadName, setImageSourceUploadName] = React.useState('');
  const [imageRefImagesText, setImageRefImagesText] = React.useState('');
  const [imageRefUploadDataUrls, setImageRefUploadDataUrls] = React.useState<string[]>([]);
  const [imageRefUploadNames, setImageRefUploadNames] = React.useState<string[]>([]);
  const [imageMask, setImageMask] = React.useState('');
  const [imageMaskUploadName, setImageMaskUploadName] = React.useState('');
  const [imageProviderOptionsText, setImageProviderOptionsText] = React.useState('{\n  "steps": 24,\n  "method": "euler"\n}');
  const [imageBusy, setImageBusy] = React.useState(false);
  const [imageError, setImageError] = React.useState('');
  const [imageRawResponse, setImageRawResponse] = React.useState('');
  const [imageOutputUris, setImageOutputUris] = React.useState<string[]>([]);
  const [imageRouteSummary, setImageRouteSummary] = React.useState<RouteSummary | null>(null);

  const normalizedConnectorIdOverride = React.useMemo(
    () => asString(routeConnectorIdOverride),
    [routeConnectorIdOverride],
  );
  const normalizedModelOverride = React.useMemo(
    () => asString(routeModelOverride),
    [routeModelOverride],
  );
  const effectiveRouteSource = React.useMemo<RouteSourceOverride>(() => {
    if (routeSourceOverride) return routeSourceOverride;
    if (normalizedConnectorIdOverride) return 'token-api';
    return '';
  }, [normalizedConnectorIdOverride, routeSourceOverride]);

  const routeOverride = React.useMemo<RuntimeRouteOverride | undefined>(() => {
    const source = effectiveRouteSource || undefined;
    const connectorId = normalizedConnectorIdOverride || undefined;
    const model = normalizedModelOverride || undefined;
    if (!source && !connectorId && !model) {
      return undefined;
    }
    return {
      source,
      connectorId,
      model,
    };
  }, [effectiveRouteSource, normalizedConnectorIdOverride, normalizedModelOverride]);

  const connectorOptions = React.useMemo(
    () => routeOptions?.connectors || [],
    [routeOptions],
  );
  const selectedConnectorOption = React.useMemo(
    () => connectorOptions.find((item) => item.id === normalizedConnectorIdOverride) || null,
    [connectorOptions, normalizedConnectorIdOverride],
  );

  const refreshRouteOptions = React.useCallback(async () => {
    setRouteOptionsBusy(true);
    setRouteOptionsError('');
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    try {
      const payload = await Promise.race<unknown>([
        hookClient.data.query({
          capability: TEST_CHAT_TTS_DATA_API_RUNTIME_ROUTE_OPTIONS,
          query: {
            capability: 'chat',
            modId: TEST_CHAT_TTS_MOD_ID,
          },
        }),
        new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            reject(new Error(`route options query timeout (${ROUTE_OPTIONS_QUERY_TIMEOUT_MS}ms)`));
          }, ROUTE_OPTIONS_QUERY_TIMEOUT_MS);
        }),
      ]).finally(() => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
      });

      const parsed = parseRuntimeRouteOptions(payload, { includeResolvedDefault: true });
      if (!parsed) {
        throw new Error('ROUTE_OPTIONS_PARSE_FAILED');
      }
      setRouteOptions(parsed);

      setRouteConnectorIdOverride((previous) => {
        const normalizedPrevious = asString(previous);
        if (normalizedPrevious) return normalizedPrevious;
        if (parsed.selected.source === 'token-api') {
          return asString(parsed.selected.connectorId);
        }
        return '';
      });
      setRouteModelOverride((previous) => {
        const normalizedPrevious = asString(previous);
        if (normalizedPrevious) return normalizedPrevious;
        if (parsed.selected.source === 'token-api') {
          return asString(parsed.selected.model);
        }
        return '';
      });
    } catch (error) {
      setRouteOptions(null);
      setRouteOptionsError(error instanceof Error ? error.message : String(error || 'Failed to load route options.'));
    } finally {
      setRouteOptionsBusy(false);
    }
  }, [hookClient]);

  const refreshProviders = React.useCallback(async () => {
    const list = await hookClient.llm.speech.listProviders();
    setProviders(list);
    const available = list.filter((item) => item.status === 'available');
    const fallback = available[0] || list[0] || null;
    setSelectedProviderId((prev) => prev || fallback?.id || '');
  }, [hookClient]);

  const refreshVoices = React.useCallback(async (providerId: string) => {
    const routeSource = effectiveRouteSource || undefined;
    const connectorId = normalizedConnectorIdOverride || undefined;
    const list = await hookClient.llm.speech.listVoices({
      providerId: providerId || undefined,
      routeSource,
      connectorId,
    });
    setVoices(list);
    const preferred = list.find((item) => asString(item.lang).toLowerCase().startsWith('zh')) || list[0] || null;
    setSelectedVoiceId((prev) => {
      if (prev && list.some((item) => item.id === prev)) return prev;
      return preferred?.id || '';
    });
  }, [effectiveRouteSource, hookClient, normalizedConnectorIdOverride]);

  React.useEffect(() => {
    void (async () => {
      try {
        await refreshProviders();
      } catch (error) {
        setTtsError(error instanceof Error ? error.message : String(error || 'Failed to load speech providers.'));
      }
    })();
  }, [refreshProviders]);

  React.useEffect(() => {
    if (!selectedProviderId) return;
    void (async () => {
      try {
        await refreshVoices(selectedProviderId);
      } catch (error) {
        setTtsError(error instanceof Error ? error.message : String(error || 'Failed to load voices.'));
      }
    })();
  }, [selectedProviderId, refreshVoices]);

  React.useEffect(() => {
    void refreshRouteOptions();
  }, [refreshRouteOptions]);

  React.useEffect(() => {
    if (!selectedConnectorOption) {
      return;
    }
    setRouteModelOverride((previous) => {
      const normalizedPrevious = asString(previous);
      if (normalizedPrevious && selectedConnectorOption.models.includes(normalizedPrevious)) {
        return normalizedPrevious;
      }
      return selectedConnectorOption.models[0] || normalizedPrevious;
    });
  }, [selectedConnectorOption]);

  const handleImageSourceFileSelected = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      try {
        const dataUrl = await readImageFileAsDataUrl(file);
        setImageSource(dataUrl);
        setImageSourceUploadName(file.name);
        setImageError('');
      } catch (error) {
        setImageError(error instanceof Error ? error.message : String(error || 'Source image upload failed.'));
      }
    },
    [],
  );

  const handleImageRefFilesSelected = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      event.target.value = '';
      if (files.length === 0) return;
      try {
        const dataUrls = await Promise.all(files.map((file) => readImageFileAsDataUrl(file)));
        const names = files.map((file) => file.name);
        setImageRefUploadDataUrls((previous) => [...previous, ...dataUrls]);
        setImageRefUploadNames((previous) => [...previous, ...names]);
        setImageError('');
      } catch (error) {
        setImageError(error instanceof Error ? error.message : String(error || 'Reference image upload failed.'));
      }
    },
    [],
  );

  const handleImageMaskFileSelected = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      try {
        const dataUrl = await readImageFileAsDataUrl(file);
        setImageMask(dataUrl);
        setImageMaskUploadName(file.name);
        setImageError('');
      } catch (error) {
        setImageError(error instanceof Error ? error.message : String(error || 'Mask image upload failed.'));
      }
    },
    [],
  );

  const handleChatTest = React.useCallback(async () => {
    const prompt = asString(chatInput);
    if (!prompt) {
      setChatError('Chat prompt is empty.');
      return;
    }
    setChatBusy(true);
    setChatError('');
    try {
      const startedAtMs = Date.now();
      const result = await aiClient.generateText({
        routeHint: 'chat/default',
        routeOverride,
        mode: 'STORY',
        prompt,
      });
      const latencyMs = Date.now() - startedAtMs;
      const output = asString(result.text);
      setChatOutput(output || '(empty output)');
      if (!asString(ttsInput) && output) {
        setTtsInput(output);
      }
      setChatRawResponse(toPrettyJson({
        at: new Date().toISOString(),
        latencyMs,
        request: {
          routeHint: 'chat/default',
          routeOverride: routeOverride || null,
          mode: 'STORY',
          prompt,
        },
        response: result,
      }));
      setRouteSummary({
        source: asString((result.route as { source?: unknown }).source) || 'unknown',
        model: asString((result.route as { model?: unknown }).model) || 'unknown',
        provider: asString((result.route as { provider?: unknown }).provider) || 'unknown',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || 'Chat test failed.');
      setChatError(message);
      setChatRawResponse(toPrettyJson({
        at: new Date().toISOString(),
        error: message,
      }));
    } finally {
      setChatBusy(false);
    }
  }, [aiClient, chatInput, routeOverride, ttsInput]);

  const handleImageTest = React.useCallback(async () => {
    const prompt = asString(imagePrompt);
    if (!prompt) {
      setImageError('Image prompt is empty.');
      return;
    }

    const sourceImage = asString(imageSource);
    if (imageMode === 'i2i' && !sourceImage) {
      setImageError('i2i mode requires source image URL/data URI.');
      return;
    }

    const requestCount = Number.parseInt(asString(imageCount), 10);
    const imageCountNormalized = Number.isFinite(requestCount) && requestCount > 0
      ? requestCount
      : 1;

    const providerOptionsText = asString(imageProviderOptionsText);
    let providerOptions: Record<string, unknown> | undefined;
    if (providerOptionsText) {
      try {
        const parsed = JSON.parse(providerOptionsText);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('providerOptions must be a JSON object');
        }
        providerOptions = parsed as Record<string, unknown>;
      } catch (error) {
        setImageError(error instanceof Error ? error.message : 'Invalid providerOptions JSON');
        return;
      }
    }

    const referenceImages = imageMode === 'i2i'
      ? [
        sourceImage,
        ...imageRefUploadDataUrls,
        ...splitTrimmedLines(imageRefImagesText),
      ].filter(Boolean)
      : undefined;

    const maskValue = imageMode === 'i2i' ? asString(imageMask) || undefined : undefined;
    const referenceImagesForLog = (referenceImages || []).map(compactImageRefForLog);

    setImageBusy(true);
    setImageError('');
    try {
      const startedAtMs = Date.now();
      const result = await aiClient.generateImage({
        routeHint: 'image/default',
        routeOverride,
        prompt,
        negativePrompt: asString(imageNegativePrompt) || undefined,
        model: asString(imageModel) || undefined,
        size: asString(imageSize) || undefined,
        n: imageCountNormalized,
        referenceImages: referenceImages && referenceImages.length > 0 ? referenceImages : undefined,
        mask: maskValue,
        responseFormat: imageResponseFormat,
        providerOptions,
      });
      const latencyMs = Date.now() - startedAtMs;
      const previewUris = result.images
        .map((image) => toImagePreviewUri(image))
        .filter(Boolean);
      setImageOutputUris(previewUris);
      setImageRawResponse(toPrettyJson({
        at: new Date().toISOString(),
        latencyMs,
        request: {
          routeHint: 'image/default',
          routeOverride: routeOverride || null,
          mode: imageMode,
          prompt,
          negativePrompt: asString(imageNegativePrompt) || null,
          model: asString(imageModel) || null,
          size: asString(imageSize) || null,
          n: imageCountNormalized,
          referenceImages: referenceImagesForLog,
          mask: maskValue ? compactImageRefForLog(maskValue) : null,
          responseFormat: imageResponseFormat,
          providerOptions: providerOptions || {},
        },
        response: result,
        previewUris,
      }));
      setImageRouteSummary({
        source: asString((result.route as { source?: unknown }).source) || 'unknown',
        model: asString((result.route as { model?: unknown }).model) || 'unknown',
        provider: asString((result.route as { provider?: unknown }).provider) || 'unknown',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || 'Image test failed.');
      setImageError(message);
      setImageRawResponse(toPrettyJson({
        at: new Date().toISOString(),
        error: message,
      }));
      setImageOutputUris([]);
    } finally {
      setImageBusy(false);
    }
  }, [
    aiClient,
    imageCount,
    imageMask,
    imageMode,
    imageModel,
    imageNegativePrompt,
    imagePrompt,
    imageProviderOptionsText,
    imageRefImagesText,
    imageRefUploadDataUrls,
    imageResponseFormat,
    imageSize,
    imageSource,
    routeOverride,
  ]);

  const handleTtsTest = React.useCallback(async () => {
    const text = asString(ttsInput);
    if (!text) {
      setTtsError('TTS input is empty.');
      return;
    }
    const voiceId = asString(manualVoiceId) || asString(selectedVoiceId);
    if (!voiceId) {
      setTtsError('No voice selected.');
      return;
    }
    setTtsBusy(true);
    setTtsError('');
    try {
      const startedAtMs = Date.now();
      const result = await hookClient.llm.speech.synthesize({
        text,
        providerId: asString(selectedProviderId) || undefined,
        routeSource: effectiveRouteSource || undefined,
        connectorId: normalizedConnectorIdOverride || undefined,
        model: normalizedModelOverride || undefined,
        voiceId,
        format: 'mp3',
      });
      const latencyMs = Date.now() - startedAtMs;
      setAudioUri(asString(result.audioUri));
      setAudioMeta({
        mimeType: asString(result.mimeType),
        durationMs: Number.isFinite(result.durationMs) ? Number(result.durationMs) : 0,
      });
      setTtsRawResponse(toPrettyJson({
        at: new Date().toISOString(),
        latencyMs,
        request: {
          text,
          providerId: asString(selectedProviderId) || null,
          routeSource: effectiveRouteSource || null,
          connectorId: normalizedConnectorIdOverride || null,
          model: normalizedModelOverride || null,
          voiceId,
          format: 'mp3',
        },
        response: result,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || 'TTS test failed.');
      setTtsError(message);
      setTtsRawResponse(toPrettyJson({
        at: new Date().toISOString(),
        error: message,
      }));
    } finally {
      setTtsBusy(false);
    }
  }, [
    hookClient,
    effectiveRouteSource,
    manualVoiceId,
    normalizedConnectorIdOverride,
    normalizedModelOverride,
    selectedProviderId,
    selectedVoiceId,
    ttsInput,
  ]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto bg-gray-50 p-4 text-sm text-gray-900">
      <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-lg font-semibold">Test Chat + Image + TTS</h2>
        <p className="mt-1 text-xs text-gray-600">
          Minimal diagnostics surface for chat, image generation, and speech synthesis.
        </p>
      </div>

      <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Route Override (Optional)</h3>
          <button
            type="button"
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs"
            disabled={routeOptionsBusy}
            onClick={() => {
              void refreshRouteOptions();
            }}
          >
            {routeOptionsBusy ? 'Refreshing...' : 'Refresh Connectors'}
          </button>
        </div>
        <p className="mb-2 text-xs text-gray-600">
          If `Connector` is set and `Source` is empty, `token-api` is inferred automatically.
        </p>
        {routeOptionsError ? (
          <div className="mb-2 rounded-md bg-amber-50 p-2 text-xs text-amber-700">
            Route options load failed: {routeOptionsError}
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs">
            <span>Source</span>
            <select
              className="rounded-md border border-gray-300 bg-white px-2 py-1"
              value={routeSourceOverride}
              onChange={(event) => setRouteSourceOverride(event.target.value as RouteSourceOverride)}
            >
              <option value="">(runtime default)</option>
              <option value="token-api">token-api</option>
              <option value="local-runtime">local-runtime</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span>Connector</span>
            <select
              className="rounded-md border border-gray-300 bg-white px-2 py-1"
              value={routeConnectorIdOverride}
              onChange={(event) => setRouteConnectorIdOverride(event.target.value)}
            >
              <option value="">(auto)</option>
              {connectorOptions.map((connector) => (
                <option key={connector.id} value={connector.id}>
                  {connector.label || connector.id} [{connector.id}]
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span>Model</span>
            <input
              className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs"
              value={routeModelOverride}
              onChange={(event) => setRouteModelOverride(event.target.value)}
              placeholder="deepseek-chat"
            />
          </label>
        </div>
        <div className="mt-2 text-xs text-gray-600">
          {connectorOptions.length > 0
            ? `Loaded connectors: ${connectorOptions.length}`
            : 'No connectors loaded from runtime route options.'}
          {selectedConnectorOption && selectedConnectorOption.models.length > 0
            ? ` | Models: ${selectedConnectorOption.models.join(', ')}`
            : ''}
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="mb-2 text-sm font-semibold">Chat Test</h3>
        <textarea
          className="h-24 w-full resize-y rounded-lg border border-gray-300 bg-white p-2 font-mono text-xs"
          value={chatInput}
          onChange={(event) => setChatInput(event.target.value)}
          placeholder="Enter prompt..."
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            disabled={chatBusy}
            onClick={() => {
              void handleChatTest();
            }}
          >
            {chatBusy ? 'Running...' : 'Run Chat Test'}
          </button>
          <button
            type="button"
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs"
            onClick={() => {
              setTtsInput(asString(chatOutput));
            }}
          >
            Copy Output To TTS
          </button>
        </div>
        {chatError ? (
          <div className="mt-2 rounded-md bg-red-50 p-2 text-xs text-red-700">{chatError}</div>
        ) : null}
        <div className="mt-2 rounded-md bg-gray-50 p-2 text-xs">
          <div className="mb-1 font-semibold">Chat Output</div>
          <div className="whitespace-pre-wrap break-words">{chatOutput || '(no output yet)'}</div>
        </div>
        <div className="mt-2 text-xs text-gray-600">
          Route: {routeSummary ? `${routeSummary.source} | ${routeSummary.provider} | ${routeSummary.model}` : 'n/a'}
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="mb-2 text-sm font-semibold">Image Test (t2i / i2i)</h3>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs">
            <span>Mode</span>
            <select
              className="rounded-md border border-gray-300 bg-white px-2 py-1"
              value={imageMode}
              onChange={(event) => setImageMode(event.target.value as ImageMode)}
            >
              <option value="t2i">t2i</option>
              <option value="i2i">i2i</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span>Model (optional)</span>
            <input
              className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs"
              value={imageModel}
              onChange={(event) => setImageModel(event.target.value)}
              placeholder="sdxl"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span>Size (optional)</span>
            <input
              className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs"
              value={imageSize}
              onChange={(event) => setImageSize(event.target.value)}
              placeholder="1024x1024"
            />
          </label>
        </div>
        <textarea
          className="mt-2 h-20 w-full resize-y rounded-lg border border-gray-300 bg-white p-2 font-mono text-xs"
          value={imagePrompt}
          onChange={(event) => setImagePrompt(event.target.value)}
          placeholder="Enter image prompt..."
        />
        <textarea
          className="mt-2 h-16 w-full resize-y rounded-lg border border-gray-300 bg-white p-2 font-mono text-xs"
          value={imageNegativePrompt}
          onChange={(event) => setImageNegativePrompt(event.target.value)}
          placeholder="Negative prompt (optional)"
        />
        {imageMode === 'i2i' ? (
          <>
            <label className="mt-2 flex flex-col gap-1 text-xs">
              <span>Source Image URL/Data URI (required in i2i)</span>
              <input
                className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs"
                value={imageSource}
                onChange={(event) => {
                  setImageSource(event.target.value);
                  setImageSourceUploadName('');
                }}
                placeholder="https://example.com/source.png"
              />
            </label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs">
                Upload Source Image
                <input
                  className="hidden"
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    void handleImageSourceFileSelected(event);
                  }}
                />
              </label>
              <button
                type="button"
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs"
                onClick={() => {
                  setImageSource('');
                  setImageSourceUploadName('');
                }}
              >
                Clear Source
              </button>
              {imageSourceUploadName ? (
                <span className="text-[11px] text-gray-600">Source file: {imageSourceUploadName}</span>
              ) : null}
            </div>
            <label className="mt-2 flex flex-col gap-1 text-xs">
              <span>Extra Reference Images (one URL/Data URI per line)</span>
              <textarea
                className="h-16 w-full resize-y rounded-lg border border-gray-300 bg-white p-2 font-mono text-xs"
                value={imageRefImagesText}
                onChange={(event) => setImageRefImagesText(event.target.value)}
                placeholder={'https://example.com/ref-1.png\nhttps://example.com/ref-2.png'}
              />
            </label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs">
                Add Local Ref Images
                <input
                  className="hidden"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => {
                    void handleImageRefFilesSelected(event);
                  }}
                />
              </label>
              <button
                type="button"
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs"
                onClick={() => {
                  setImageRefUploadDataUrls([]);
                  setImageRefUploadNames([]);
                }}
              >
                Clear Local Refs
              </button>
            </div>
            {imageRefUploadNames.length > 0 ? (
              <div className="mt-1 text-[11px] text-gray-600">
                Local refs ({imageRefUploadNames.length}): {imageRefUploadNames.join(', ')}
              </div>
            ) : null}
            <label className="mt-2 flex flex-col gap-1 text-xs">
              <span>Mask URL/Data URI (optional)</span>
              <input
                className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs"
                value={imageMask}
                onChange={(event) => {
                  setImageMask(event.target.value);
                  setImageMaskUploadName('');
                }}
                placeholder="https://example.com/mask.png"
              />
            </label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs">
                Upload Mask Image
                <input
                  className="hidden"
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    void handleImageMaskFileSelected(event);
                  }}
                />
              </label>
              <button
                type="button"
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs"
                onClick={() => {
                  setImageMask('');
                  setImageMaskUploadName('');
                }}
              >
                Clear Mask
              </button>
              {imageMaskUploadName ? (
                <span className="text-[11px] text-gray-600">Mask file: {imageMaskUploadName}</span>
              ) : null}
            </div>
          </>
        ) : null}
        <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs">
            <span>Image Count</span>
            <input
              className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs"
              value={imageCount}
              onChange={(event) => setImageCount(event.target.value)}
              placeholder="1"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span>Response Format</span>
            <select
              className="rounded-md border border-gray-300 bg-white px-2 py-1"
              value={imageResponseFormat}
              onChange={(event) => setImageResponseFormat(event.target.value as 'url' | 'base64')}
            >
              <option value="url">url</option>
              <option value="base64">base64</option>
            </select>
          </label>
        </div>
        <label className="mt-2 flex flex-col gap-1 text-xs">
          <span>Provider Options JSON (optional)</span>
          <textarea
            className="h-20 w-full resize-y rounded-lg border border-gray-300 bg-white p-2 font-mono text-xs"
            value={imageProviderOptionsText}
            onChange={(event) => setImageProviderOptionsText(event.target.value)}
            placeholder='{"steps":24,"method":"euler"}'
          />
        </label>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            className="rounded-md bg-fuchsia-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            disabled={imageBusy}
            onClick={() => {
              void handleImageTest();
            }}
          >
            {imageBusy ? 'Generating...' : 'Run Image Test'}
          </button>
        </div>
        {imageError ? (
          <div className="mt-2 rounded-md bg-red-50 p-2 text-xs text-red-700">{imageError}</div>
        ) : null}
        <div className="mt-2 text-xs text-gray-600">
          Route: {imageRouteSummary ? `${imageRouteSummary.source} | ${imageRouteSummary.provider} | ${imageRouteSummary.model}` : 'n/a'}
        </div>
        <div className="mt-2 rounded-md bg-gray-50 p-2">
          {imageOutputUris.length > 0 ? (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {imageOutputUris.map((uri, index) => (
                <div key={`${uri}-${index}`} className="overflow-hidden rounded-md border border-gray-200 bg-white">
                  <img className="h-auto w-full object-contain" src={uri} alt={`generated-${index + 1}`} />
                  <div className="border-t border-gray-100 px-2 py-1 text-[11px] text-gray-600">Image #{index + 1}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-gray-600">(no generated image yet)</div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="mb-2 text-sm font-semibold">TTS Test</h3>
        <textarea
          className="h-20 w-full resize-y rounded-lg border border-gray-300 bg-white p-2 font-mono text-xs"
          value={ttsInput}
          onChange={(event) => setTtsInput(event.target.value)}
          placeholder="Enter text for speech synthesis..."
        />
        <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs">
            <span>Provider</span>
            <select
              className="rounded-md border border-gray-300 bg-white px-2 py-1"
              value={selectedProviderId}
              onChange={(event) => setSelectedProviderId(event.target.value)}
            >
              <option value="">(auto)</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name} ({provider.status})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span>Voice</span>
            <select
              className="rounded-md border border-gray-300 bg-white px-2 py-1"
              value={selectedVoiceId}
              onChange={(event) => setSelectedVoiceId(event.target.value)}
            >
              <option value="">(select voice)</option>
              {voices.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.name} [{voice.providerId}] {voice.lang ? `(${voice.lang})` : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="mt-2 flex flex-col gap-1 text-xs">
          <span>Manual Voice Override (optional)</span>
          <input
            className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs"
            value={manualVoiceId}
            onChange={(event) => setManualVoiceId(event.target.value)}
            placeholder="voice id"
          />
        </label>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            disabled={ttsBusy}
            onClick={() => {
              void handleTtsTest();
            }}
          >
            {ttsBusy ? 'Synthesizing...' : 'Run TTS Test'}
          </button>
          <button
            type="button"
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs"
            onClick={() => {
              void refreshProviders();
              if (selectedProviderId) {
                void refreshVoices(selectedProviderId);
              }
            }}
          >
            Refresh Providers/Voices
          </button>
        </div>
        {ttsError ? (
          <div className="mt-2 rounded-md bg-red-50 p-2 text-xs text-red-700">{ttsError}</div>
        ) : null}
        <div className="mt-2 text-xs text-gray-600">
          {audioMeta.mimeType ? `Audio: ${audioMeta.mimeType}` : 'Audio: n/a'}
          {audioMeta.durationMs > 0 ? ` | Duration: ${audioMeta.durationMs}ms` : ''}
        </div>
        {audioUri ? (
          <audio className="mt-2 w-full" src={audioUri} controls preload="metadata">
            <track kind="captions" />
          </audio>
        ) : (
          <div className="mt-2 rounded-md bg-gray-50 p-2 text-xs text-gray-600">(no synthesized audio yet)</div>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Raw Diagnostics</h3>
          <button
            type="button"
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs"
            onClick={() => {
              setChatRawResponse('');
              setImageRawResponse('');
              setTtsRawResponse('');
            }}
          >
            Clear Raw Logs
          </button>
        </div>
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
          <div className="rounded-md bg-gray-50 p-2">
            <div className="mb-1 text-xs font-semibold">Chat Raw Response</div>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">
              {chatRawResponse || '(no chat run yet)'}
            </pre>
          </div>
          <div className="rounded-md bg-gray-50 p-2">
            <div className="mb-1 text-xs font-semibold">Image Raw Response</div>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">
              {imageRawResponse || '(no image run yet)'}
            </pre>
          </div>
          <div className="rounded-md bg-gray-50 p-2">
            <div className="mb-1 text-xs font-semibold">TTS Raw Response</div>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">
              {ttsRawResponse || '(no tts run yet)'}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
