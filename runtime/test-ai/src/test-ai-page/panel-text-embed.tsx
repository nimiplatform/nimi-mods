import React from 'react';
import type {
  ModRuntimeClient,
  ModRuntimeResolvedBinding,
} from '@nimiplatform/sdk/mod/runtime';
import type {
  RuntimeCanonicalCapability,
  RuntimeRouteSource,
} from '@nimiplatform/sdk/mod/runtime-route';
import {
  asString,
  bindingForConnector,
  bindingForModel,
  bindingForSource,
  makeEmptyDiagnostics,
  resolveEffectiveBinding,
  resolveRouteModelPickerState,
  toPrettyJson,
  useTestAiLocale,
} from './core.js';
import type { CapabilityState } from './core.js';
import {
  DiagnosticsPanel,
  ErrorBox,
  InfoBox,
  RawJsonSection,
} from './components.js';
import {
  RouteSelect,
  type RouteSelectOption,
} from './route-select.js';

type TextEmbedPanelProps = {
  state: CapabilityState;
  runtimeClient: ModRuntimeClient;
  onStateChange: (updater: (prev: CapabilityState) => CapabilityState) => void;
  onRouteReload: () => void;
};

export function TextEmbedPanel(props: TextEmbedPanelProps) {
  const locale = useTestAiLocale();
  const { state, runtimeClient, onStateChange, onRouteReload } = props;
  const [text, setText] = React.useState<string>(locale.textEmbed.defaultText);
  const [showModelMenu, setShowModelMenu] = React.useState(false);
  const [showRouteDialog, setShowRouteDialog] = React.useState(false);
  const [manualModelDraft, setManualModelDraft] = React.useState('');
  const [copiedVector, setCopiedVector] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const modelMenuRef = React.useRef<HTMLDivElement | null>(null);

  const {
    effectiveBinding,
    activeSource,
    activeConnectorId,
    activeModel,
    modelOptions,
    cloudCatalogMissing,
    activeModelInOptions,
  } = resolveRouteModelPickerState(state.snapshot, state.binding);
  const tokenConnectors = state.snapshot?.connectors || [];
  const activeConnector = tokenConnectors.find((item) => item.id === activeConnectorId) || null;
  const modelMenuOptions = modelOptions.length > 0 ? modelOptions : (activeModel ? [activeModel] : []);
  const modelDisplayName = activeModel || effectiveBinding?.model || effectiveBinding?.modelId || locale.route.selectModel;
  const textLength = text.length;
  const lineCount = Math.max(1, text.split(/\r?\n/g).length);
  const estimatedTokens = Math.max(1, Math.ceil(asString(text).length / 4));
  const sourceSelectOptions: RouteSelectOption[] = [
    { value: 'local', label: locale.common.local },
    { value: 'cloud', label: locale.common.cloud },
  ];
  const connectorSelectOptions: RouteSelectOption[] = [
    { value: '', label: locale.common.none, disabled: true },
    ...tokenConnectors.map((connector) => ({
      value: connector.id,
      label: connector.label || connector.id,
    })),
  ];
  const modelSelectOptions: RouteSelectOption[] = [
    {
      value: '',
      label: modelOptions.length === 0
        ? (activeSource === 'cloud' ? locale.route.connectorCatalogMissingModels : locale.route.noLocalModels)
        : locale.route.selectModel,
      disabled: true,
    },
    ...modelOptions.map((model) => ({ value: model, label: model })),
  ];

  React.useEffect(() => {
    setManualModelDraft(activeModel);
  }, [activeModel]);

  React.useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = '0px';
    node.style.height = `${Math.min(Math.max(node.scrollHeight, 280), 560)}px`;
  }, [text]);

  React.useEffect(() => {
    if (cloudCatalogMissing || (asString(activeModel) && !activeModelInOptions)) {
      setShowRouteDialog(true);
    }
  }, [cloudCatalogMissing, activeModel, activeModelInOptions]);

  React.useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (showModelMenu && modelMenuRef.current && !modelMenuRef.current.contains(target)) {
        setShowModelMenu(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [showModelMenu]);

  const applySource = React.useCallback((source: RuntimeRouteSource) => {
    onStateChange((prev) => ({
      ...prev,
      binding: bindingForSource(prev.snapshot, source),
    }));
  }, [onStateChange]);

  const applyConnector = React.useCallback((connectorId: string) => {
    onStateChange((prev) => ({
      ...prev,
      binding: bindingForConnector(prev.snapshot, connectorId, resolveEffectiveBinding(prev.snapshot, prev.binding)),
    }));
  }, [onStateChange]);

  const applyManualModel = React.useCallback((model: string) => {
    onStateChange((prev) => ({
      ...prev,
      binding: bindingForModel(prev.snapshot, model, prev.binding),
    }));
  }, [onStateChange]);

  const handleRun = React.useCallback(async () => {
    if (!asString(text)) {
      onStateChange((prev) => ({ ...prev, error: locale.textEmbed.inputEmpty }));
      return;
    }
    onStateChange((prev) => ({
      ...prev,
      busy: true,
      busyLabel: locale.textEmbed.preparingRoute,
      error: '',
      diagnostics: makeEmptyDiagnostics(),
    }));
    const t0 = Date.now();
    const binding = resolveEffectiveBinding(state.snapshot, state.binding) || undefined;
    const requestParams: Record<string, unknown> = { input: text, ...(binding ? { binding } : {}) };
    let resolved: ModRuntimeResolvedBinding | undefined;
    try {
      resolved = await runtimeClient.route.resolve({ capability: 'text.embed' as RuntimeCanonicalCapability, binding });
      onStateChange((prev) => ({
        ...prev,
        busy: true,
        busyLabel: resolved?.source === 'local' ? locale.textEmbed.warmingLocalModel : locale.textEmbed.generating,
      }));
      const result = await runtimeClient.ai.embedding.generate({ input: text, binding });
      const elapsed = Date.now() - t0;
      const vector = result.vectors[0] || [];
      const preview = vector.slice(0, 8).map((value: number) => value.toFixed(6)).join(', ');

      onStateChange((prev) => ({
        ...prev,
        busy: false,
        busyLabel: undefined,
        result: 'passed',
        output: {
          dimensions: vector.length,
          vectors: result.vectors.length,
          preview: `[${preview}${vector.length > 8 ? ', …' : ''}]`,
          values: vector,
          vectorText: `[${vector.join(', ')}]`,
        },
        rawResponse: toPrettyJson({ request: requestParams, resolved, response: result }),
        diagnostics: {
          requestParams,
          resolvedRoute: resolved ?? null,
          responseMetadata: {
            inputTokens: result.usage?.inputTokens,
            outputTokens: result.usage?.outputTokens,
            totalTokens: result.usage?.totalTokens,
            traceId: result.trace?.traceId,
            modelResolved: result.trace?.modelResolved,
            elapsed,
          },
        },
      }));
    } catch (error) {
      const elapsed = Date.now() - t0;
      const message = error instanceof Error ? error.message : String(error || locale.textEmbed.failed);
      onStateChange((prev) => ({
        ...prev,
        busy: false,
        busyLabel: undefined,
        result: 'failed',
        error: message,
        rawResponse: toPrettyJson({ request: requestParams, resolved, error: message }),
        diagnostics: { requestParams, resolvedRoute: resolved ?? null, responseMetadata: { elapsed } },
      }));
    }
  }, [locale, text, state.snapshot, state.binding, runtimeClient, onStateChange]);

  const embedOutput = state.output as {
    dimensions?: number;
    vectors?: number;
    preview?: string;
    values?: number[];
    vectorText?: string;
  } | null;
  const responseMeta = state.diagnostics.responseMetadata;
  const outputText = embedOutput?.vectorText || '';

  const handleCopyVector = React.useCallback(() => {
    if (!outputText) return;
    void navigator.clipboard.writeText(outputText).then(() => {
      setCopiedVector(true);
      setTimeout(() => setCopiedVector(false), 1500);
    });
  }, [outputText]);

  return (
    <div className="relative flex flex-col gap-5">
      <div className="grid gap-4 bg-[#f8fafc] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="flex min-h-[440px] flex-col overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-[0_18px_44px_rgba(15,23,42,0.06)]">
          {showRouteDialog ? (
            <div className="border-b border-gray-100 bg-[#fbfcfd] px-5 py-5">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <div className="text-lg font-semibold text-gray-950">{locale.textEmbed.title}</div>
                  <div className="mt-1 text-sm text-gray-500">
                    {locale.textEmbed.description}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowRouteDialog(false)}
                  className="rounded-full border border-gray-200 p-2 text-gray-500 transition hover:border-gray-300 hover:text-gray-700"
                  title={locale.common.collapse}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="m18 15-6-6-6 6" />
                  </svg>
                </button>
              </div>

              {state.routeError ? (
                <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  {state.routeError}
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-3">
                <label className="flex flex-col gap-2 text-sm">
                  <span className="text-gray-500">{locale.route.source}</span>
                  <RouteSelect
                    value={activeSource}
                    options={sourceSelectOptions}
                    onChange={(value) => applySource(value as RuntimeRouteSource)}
                    disabled={!state.snapshot}
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm">
                  <span className="text-gray-500">{locale.route.connector}</span>
                  <RouteSelect
                    value={activeSource === 'cloud' ? activeConnectorId : ''}
                    options={connectorSelectOptions}
                    onChange={applyConnector}
                    disabled={!state.snapshot || activeSource !== 'cloud'}
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm">
                  <span className="text-gray-500">{locale.route.modelOverride}</span>
                  <RouteSelect
                    value={activeModelInOptions ? activeModel : ''}
                    options={modelSelectOptions}
                    onChange={(value) => {
                      applyManualModel(value);
                      setManualModelDraft(value);
                    }}
                    disabled={!state.snapshot || modelOptions.length === 0}
                  />
                </label>
              </div>

              <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                {activeSource === 'cloud'
                  ? `${locale.common.provider}: ${activeConnector?.label || activeConnector?.id || locale.common.unknown}`
                  : locale.route.usingLocalCatalog}
              </div>

              <label className="mt-4 flex flex-col gap-2 text-sm">
                <span className="text-gray-500">{locale.route.manualModelId}</span>
                <input
                  className="rounded-2xl border border-gray-200 bg-white px-3 py-3 outline-none focus:border-emerald-400"
                  value={manualModelDraft}
                  onChange={(event) => setManualModelDraft(event.target.value)}
                  onBlur={() => applyManualModel(manualModelDraft)}
                  placeholder={locale.route.modelIdPlaceholder}
                />
              </label>

              <div className="mt-6 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => onStateChange((prev) => ({ ...prev, binding: null }))}
                  className="rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-600 transition hover:border-gray-300 hover:text-gray-900"
                >
                  {locale.route.useDefaultRoute}
                </button>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={onRouteReload}
                    className="rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-600 transition hover:border-gray-300 hover:text-gray-900"
                  >
                    {state.routeLoading ? locale.common.refreshing : locale.route.refreshRoute}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      applyManualModel(manualModelDraft);
                      setShowRouteDialog(false);
                    }}
                    className="rounded-full bg-[#111827] px-4 py-2 text-sm text-white transition hover:bg-[#1f2937]"
                  >
                    {locale.common.saveConfiguration}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <textarea
            ref={textareaRef}
            className="min-h-[220px] flex-1 resize-none border-0 bg-transparent px-5 py-5 text-[17px] leading-8 text-gray-900 outline-none placeholder:text-gray-400"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={locale.textEmbed.inputPlaceholder}
          />

          <div className="border-t border-gray-100 bg-[#fbfcfd] px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="relative" ref={modelMenuRef}>
                <button
                  type="button"
                  onClick={() => setShowModelMenu((prev) => !prev)}
                  className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 transition hover:border-gray-300 hover:text-gray-900"
                >
                  <span className="max-w-[220px] truncate font-mono text-[11px]">{modelDisplayName}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>

                {showModelMenu ? (
                  <div className="absolute bottom-[calc(100%+10px)] left-0 z-30 w-72 rounded-[24px] border border-gray-200 bg-white p-2 shadow-[0_20px_50px_rgba(15,23,42,0.16)]">
                    <div className="mb-1 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">
                      {locale.route.routeModel}
                    </div>
                    {modelMenuOptions.map((model) => (
                      <button
                        key={model}
                        type="button"
                        onClick={() => {
                          applyManualModel(model);
                          setShowModelMenu(false);
                        }}
                        className="flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm text-gray-700 transition hover:bg-gray-50"
                      >
                        <span className="truncate font-mono text-[12px]">{model}</span>
                        {activeModel === model ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">{locale.common.ready}</span>
                        ) : null}
                      </button>
                    ))}
                    <div className="my-2 border-t border-gray-100" />
                    <button
                      type="button"
                      onClick={() => {
                        setShowModelMenu(false);
                        setShowRouteDialog(true);
                      }}
                      className="flex w-full items-center rounded-2xl px-3 py-2.5 text-left text-sm text-gray-700 transition hover:bg-gray-50"
                    >
                      {locale.route.dialogTitle}
                    </button>
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                disabled={state.busy || !asString(text)}
                onClick={() => { void handleRun(); }}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-[#111827] text-white transition hover:bg-[#1f2937] disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
                title={locale.textEmbed.run}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
              <span className="rounded-full bg-gray-100 px-2.5 py-1 font-medium">
                {locale.textEmbed.source}: <span className="font-mono text-gray-700">{activeSource}</span>
              </span>
              <span className="rounded-full bg-gray-100 px-2.5 py-1 font-medium">
                {locale.textEmbed.chars}: <span className="font-mono text-gray-700">{textLength}</span>
              </span>
              <span className="rounded-full bg-gray-100 px-2.5 py-1 font-medium">
                {locale.textEmbed.lines}: <span className="font-mono text-gray-700">{lineCount}</span>
              </span>
              <span className="rounded-full bg-gray-100 px-2.5 py-1 font-medium">
                {locale.textEmbed.estimatedTokens}: <span className="font-mono text-gray-700">~{estimatedTokens}</span>
              </span>
              {activeSource === 'cloud' && activeConnectorId ? (
                <span className="rounded-full bg-gray-100 px-2.5 py-1 font-medium">
                  {locale.textEmbed.connector}: <span className="font-mono text-gray-700">{activeConnector?.label || activeConnectorId}</span>
                </span>
              ) : null}
              {responseMeta?.modelResolved ? (
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
                  {locale.textEmbed.resolved}: <span className="font-mono">{responseMeta.modelResolved}</span>
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex min-h-[440px] flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,_rgba(248,250,252,0.96)_0%,_rgba(241,245,249,0.96)_100%)] shadow-[0_18px_44px_rgba(15,23,42,0.06)]">
          <div className="flex items-center justify-between border-b border-slate-200 bg-white/70 px-4 py-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">{locale.textEmbed.vectorOutput}</div>
              <div className="mt-1 text-xs text-slate-500">{locale.textEmbed.vectorOutputDescription}</div>
            </div>
            {embedOutput ? (
              <div className="flex items-center gap-2">
                <div className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                  {locale.textEmbed.shortDimensions} {embedOutput.dimensions ?? 0}
                </div>
                <button
                  type="button"
                  onClick={handleCopyVector}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                >
                  {copiedVector ? locale.common.copied : locale.common.copy}
                </button>
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 border-b border-slate-200 px-4 py-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-white/75 px-3 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{locale.textEmbed.vectors}</div>
              <div className="mt-1 font-mono text-sm text-slate-800">{embedOutput?.vectors ?? 0}</div>
            </div>
            <div className="rounded-2xl bg-white/75 px-3 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{locale.textEmbed.dimensions}</div>
              <div className="mt-1 font-mono text-sm text-slate-800">{embedOutput?.dimensions ?? '—'}</div>
            </div>
            <div className="rounded-2xl bg-white/75 px-3 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{locale.textEmbed.elapsed}</div>
              <div className="mt-1 font-mono text-sm text-slate-800">{responseMeta?.elapsed !== undefined ? `${responseMeta.elapsed} ms` : '—'}</div>
            </div>
          </div>

          <div className="grid gap-3 border-b border-slate-200 px-4 py-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-white/75 px-3 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{locale.textEmbed.resolvedModel}</div>
              <div className="mt-1 truncate font-mono text-sm text-slate-800">{responseMeta?.modelResolved || modelDisplayName}</div>
            </div>
            <div className="rounded-2xl bg-white/75 px-3 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{locale.textEmbed.traceId}</div>
              <div className="mt-1 truncate font-mono text-sm text-slate-800">{responseMeta?.traceId || '—'}</div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 font-mono text-[13px] leading-7 text-slate-700">
            {embedOutput?.vectorText ? (
              <pre className="whitespace-pre-wrap break-all">{embedOutput.vectorText}</pre>
            ) : state.busy ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-slate-400">
                <div className="flex h-14 w-14 items-center justify-center rounded-full border border-slate-200 bg-white">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 3v4" />
                    <path d="M12 17v4" />
                    <path d="M3 12h4" />
                    <path d="M17 12h4" />
                    <path d="m5.6 5.6 2.8 2.8" />
                    <path d="m15.6 15.6 2.8 2.8" />
                    <path d="m5.6 18.4 2.8-2.8" />
                    <path d="m15.6 8.4 2.8-2.8" />
                  </svg>
                </div>
                <div className="text-sm">{state.busyLabel || locale.textEmbed.embedding}</div>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-slate-400">
                <div className="flex h-14 w-14 items-center justify-center rounded-full border border-slate-200 bg-white">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 7h16" />
                    <path d="M4 12h16" />
                    <path d="M4 17h10" />
                  </svg>
                </div>
                <div className="text-sm italic">{locale.common.outputPending}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {state.error ? <ErrorBox message={state.error} /> : null}
      {embedOutput?.preview ? <InfoBox message={`${locale.common.previewPrefix} ${embedOutput.preview}`} /> : null}
      <DiagnosticsPanel diagnostics={state.diagnostics} />
      {state.rawResponse ? <RawJsonSection content={state.rawResponse} /> : null}
    </div>
  );
}
