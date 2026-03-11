import React from 'react';
import type {
  ModRuntimeClient,
  ModRuntimeResolvedBinding,
} from '@nimiplatform/sdk/mod/runtime';
import type { RuntimeRouteSource } from '@nimiplatform/sdk/mod/runtime-route';
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
  InfoBox,
  RawJsonSection,
} from './components.js';
import {
  RouteSelect,
  type RouteSelectOption,
} from './route-select.js';

type TextGeneratePanelProps = {
  state: CapabilityState;
  runtimeClient: ModRuntimeClient;
  onStateChange: (updater: (prev: CapabilityState) => CapabilityState) => void;
  onRouteReload: () => void;
};

export function TextGeneratePanel(props: TextGeneratePanelProps) {
  const locale = useTestAiLocale();
  const { state, runtimeClient, onStateChange, onRouteReload } = props;
  const [prompt, setPrompt] = React.useState<string>(locale.textGenerate.defaultPrompt);
  const [system, setSystem] = React.useState('');
  const [temperature, setTemperature] = React.useState('1');
  const [maxTokens, setMaxTokens] = React.useState('');
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [showModelMenu, setShowModelMenu] = React.useState(false);
  const [showRouteDialog, setShowRouteDialog] = React.useState(false);
  const [showConversation, setShowConversation] = React.useState(false);
  const [showDeveloperDetails, setShowDeveloperDetails] = React.useState(false);
  const promptRef = React.useRef<HTMLTextAreaElement | null>(null);
  const advancedRef = React.useRef<HTMLDivElement | null>(null);
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
  const [manualModelDraft, setManualModelDraft] = React.useState(activeModel);
  const temperatureValue = Number.isFinite(Number(temperature))
    ? Math.max(0, Math.min(2, Number(temperature)))
    : 1;
  const quickTokenOptions = ['Auto', '1024', '2048', '4096'] as const;
  const modelMenuOptions = modelOptions.length > 0 ? modelOptions : (activeModel ? [activeModel] : []);
  const modelDisplayName = activeModel || effectiveBinding?.model || effectiveBinding?.modelId || locale.route.selectModel;
  const sourceOptions: RouteSelectOption[] = [
    { value: 'local', label: locale.common.local },
    { value: 'cloud', label: locale.common.cloud },
  ];
  const connectorOptions: RouteSelectOption[] = [
    { value: '', label: locale.common.none },
    ...tokenConnectors.map((connector) => ({
      value: connector.id,
      label: connector.label || connector.id,
    })),
  ];
  const modelSelectOptions: RouteSelectOption[] = modelOptions.length === 0
    ? [{
        value: '',
        label: activeSource === 'cloud' ? locale.route.connectorCatalogMissingModels : locale.route.noLocalModels,
        disabled: true,
      }]
    : [
        { value: '', label: locale.route.selectModel },
        ...modelOptions.map((model) => ({ value: model, label: model })),
      ];

  React.useEffect(() => {
    setManualModelDraft(activeModel);
  }, [activeModel]);

  React.useEffect(() => {
    const node = promptRef.current;
    if (!node) return;
    node.style.height = '0px';
    node.style.height = `${Math.min(Math.max(node.scrollHeight, 56), 240)}px`;
  }, [prompt]);

  React.useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (showAdvanced && advancedRef.current && !advancedRef.current.contains(target)) {
        setShowAdvanced(false);
      }
      if (showModelMenu && modelMenuRef.current && !modelMenuRef.current.contains(target)) {
        setShowModelMenu(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [showAdvanced, showModelMenu]);

  React.useEffect(() => {
    if (state.output) {
      setShowConversation(true);
    }
  }, [state.output]);

  React.useEffect(() => {
    if (showDeveloperDetails) {
      setShowConversation(false);
    }
  }, [showDeveloperDetails]);

  const handleRun = React.useCallback(async () => {
    if (!asString(prompt)) {
      onStateChange((prev) => ({ ...prev, error: locale.textGenerate.promptEmpty }));
      return;
    }
    setShowAdvanced(false);
    setShowModelMenu(false);
    onStateChange((prev) => ({ ...prev, busy: true, busyLabel: locale.textGenerate.preparingRoute, error: '', diagnostics: makeEmptyDiagnostics() }));
    const t0 = Date.now();
    const binding = resolveEffectiveBinding(state.snapshot, state.binding) || undefined;
    const tempNum = temperature ? Number(temperature) : undefined;
    const maxTokNum = maxTokens ? Number(maxTokens) : undefined;
    const requestParams: Record<string, unknown> = {
      input: prompt,
      ...(system ? { system } : {}),
      ...(tempNum !== undefined ? { temperature: tempNum } : {}),
      ...(maxTokNum !== undefined ? { maxTokens: maxTokNum } : {}),
      ...(binding ? { binding } : {}),
    };
    let resolved: ModRuntimeResolvedBinding | undefined;
    try {
      resolved = await runtimeClient.route.resolve({ capability: 'text.generate', binding });
      onStateChange((prev) => ({
        ...prev,
        busy: true,
        busyLabel: resolved?.source === 'local' ? locale.textGenerate.warmingLocalModel : locale.common.running,
      }));
      const result = await runtimeClient.ai.text.generate({
        input: prompt,
        ...(system ? { system } : {}),
        ...(tempNum !== undefined ? { temperature: tempNum } : {}),
        ...(maxTokNum !== undefined ? { maxTokens: maxTokNum } : {}),
        binding,
      });
      const elapsed = Date.now() - t0;

      onStateChange((prev) => ({
        ...prev,
        busy: false,
        busyLabel: '',
        result: 'passed',
        output: asString(result.text) || locale.textGenerate.emptyOutput,
        rawResponse: toPrettyJson({ request: requestParams, resolved, response: result }),
        diagnostics: {
          requestParams,
          resolvedRoute: resolved ?? null,
          responseMetadata: {
            finishReason: result.finishReason,
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
      const message = error instanceof Error ? error.message : String(error || locale.textGenerate.generateFailed);
      onStateChange((prev) => ({
        ...prev,
        busy: false,
        busyLabel: '',
        result: 'failed',
        error: message,
        rawResponse: toPrettyJson({ request: requestParams, resolved, error: message }),
        diagnostics: { requestParams, resolvedRoute: resolved ?? null, responseMetadata: { elapsed } },
      }));
    }
  }, [locale, prompt, system, temperature, maxTokens, state.snapshot, state.binding, runtimeClient, onStateChange]);

  const selectModel = React.useCallback((model: string) => {
    if (!asString(model)) return;
    onStateChange((prev) => ({
      ...prev,
      binding: bindingForModel(prev.snapshot, model, resolveEffectiveBinding(prev.snapshot, prev.binding)),
    }));
    setShowModelMenu(false);
  }, [onStateChange]);

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
    setManualModelDraft(model);
    onStateChange((prev) => ({
      ...prev,
      binding: bindingForModel(prev.snapshot, model, resolveEffectiveBinding(prev.snapshot, prev.binding)),
    }));
  }, [onStateChange]);

  const isEmptyState = !state.output && !state.busy && !state.error;
  const titleHero = (
    <div className="mb-5 flex flex-col items-center text-center">
      <h1 className="text-[58px] font-black uppercase tracking-[0.08em] text-[#0f172a] sm:text-[72px]">
        {locale.textGenerate.heroTitle}
      </h1>
    </div>
  );
  const composer = (
    <div className="mx-auto w-full max-w-4xl">
      <div className="relative rounded-[34px] border border-gray-200 bg-white px-5 pb-14 pt-3 shadow-[0_20px_70px_rgba(15,23,42,0.08)] transition-all focus-within:border-[#4ECCA3]/50 focus-within:shadow-[0_20px_70px_rgba(78,204,163,0.16)]">
        <textarea
          ref={promptRef}
          className="min-h-[56px] w-full resize-none overflow-y-auto border-0 bg-transparent pr-2 text-[16px] leading-7 text-gray-900 outline-none placeholder:text-gray-400"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={locale.textGenerate.placeholder}
        />

        <div className="absolute bottom-4 left-4 flex items-center gap-2">
          <div className="relative" ref={advancedRef}>
            <button
              type="button"
              onClick={() => {
                setShowAdvanced((prev) => !prev);
                setShowModelMenu(false);
              }}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition hover:border-gray-300 hover:text-gray-800"
              title={locale.textGenerate.advancedSettings}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 3v4" />
                <path d="M12 17v4" />
                <path d="M3 12h4" />
                <path d="M17 12h4" />
                <path d="m5.64 5.64 2.83 2.83" />
                <path d="m15.53 15.53 2.83 2.83" />
                <path d="m5.64 18.36 2.83-2.83" />
                <path d="m15.53 8.47 2.83-2.83" />
                <circle cx="12" cy="12" r="3.5" />
              </svg>
            </button>

            {showAdvanced ? (
              <div className="absolute bottom-14 left-0 z-20 w-[360px] rounded-[26px] border border-gray-200 bg-white p-4 shadow-[0_22px_55px_rgba(15,23,42,0.16)]">
                <div className="mb-4 text-sm font-semibold text-gray-900">{locale.textGenerate.advancedParameters}</div>
                <div className="space-y-4">
                  <label className="block">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">{locale.textGenerate.systemPrompt}</div>
                    <textarea
                      className="h-24 w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm leading-6 text-gray-800 outline-none focus:border-[#4ECCA3] focus:bg-white"
                      value={system}
                      onChange={(event) => setSystem(event.target.value)}
                      placeholder={locale.textGenerate.systemPromptPlaceholder}
                    />
                  </label>
                  <div>
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">{locale.textGenerate.temperature}</div>
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.1"
                      value={temperatureValue}
                      onChange={(event) => setTemperature(event.target.value)}
                      className="h-2 w-full cursor-pointer appearance-none rounded-full bg-gray-200 accent-[#4ECCA3]"
                    />
                    <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                      <span>{locale.textGenerate.precise}</span>
                      <span>{temperatureValue.toFixed(1)}</span>
                      <span>{locale.textGenerate.creative}</span>
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">{locale.textGenerate.maxTokens}</div>
                    <div className="flex flex-wrap gap-2">
                      {quickTokenOptions.map((option) => {
                        const active = option === 'Auto' ? !asString(maxTokens) : maxTokens === option;
                        return (
                          <button
                            key={option}
                            type="button"
                            onClick={() => setMaxTokens(option === 'Auto' ? '' : option)}
                            className={active
                              ? 'rounded-full bg-[#111827] px-3 py-1.5 text-xs text-white'
                              : 'rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 transition hover:border-gray-300 hover:text-gray-900'}
                          >
                            {option}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="absolute bottom-4 right-4 flex items-center gap-2">
          <div className="relative" ref={modelMenuRef}>
            <button
              type="button"
              onClick={() => {
                setShowModelMenu((prev) => !prev);
                setShowAdvanced(false);
              }}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-4 text-sm text-gray-700 transition hover:border-gray-300 hover:bg-white"
            >
              <span className="max-w-[170px] truncate">{modelDisplayName}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {showModelMenu ? (
              <div className="absolute bottom-14 right-0 z-20 w-[320px] rounded-[26px] border border-gray-200 bg-white p-2 shadow-[0_22px_55px_rgba(15,23,42,0.16)]">
                <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">{locale.textGenerate.models}</div>
                <div className="max-h-80 overflow-y-auto py-1">
                  {modelMenuOptions.length > 0 ? modelMenuOptions.map((model) => {
                    const active = model === activeModel;
                    return (
                      <button
                        key={model}
                        type="button"
                        onClick={() => selectModel(model)}
                        className="flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm text-gray-700 transition hover:bg-gray-50"
                      >
                        <span className="truncate">{model}</span>
                        <span className={active ? 'text-[#4ECCA3]' : 'text-transparent'}>{active ? '\u2713' : ''}</span>
                      </button>
                    );
                  }) : (
                    <div className="px-3 py-3 text-sm text-gray-400">
                      {cloudCatalogMissing ? locale.textGenerate.connectorModelDataMissing : locale.textGenerate.noModelData}
                    </div>
                  )}
                </div>
                <div className="my-1 h-px bg-gray-100" />
                <button
                  type="button"
                  onClick={() => {
                    setShowModelMenu(false);
                    setShowAdvanced(false);
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
            disabled={state.busy || !asString(prompt)}
            onClick={() => { void handleRun(); }}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[#111827] text-white transition hover:bg-[#1f2937] disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
            title={locale.textGenerate.send}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 19V5" />
              <path d="m5 12 7-7 7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="test-ai-scroll-shell relative flex h-full min-h-[720px] flex-col overflow-y-auto overflow-x-hidden bg-[#f8fafc]">
      <style>{`
        .test-ai-scroll-shell,
        .test-ai-scroll-shell * {
          scrollbar-width: thin;
          scrollbar-color: rgba(148, 163, 184, 0.55) transparent;
        }
        .test-ai-scroll-shell *::-webkit-scrollbar {
          width: 10px;
          height: 10px;
        }
        .test-ai-scroll-shell *::-webkit-scrollbar-track {
          background: transparent;
        }
        .test-ai-scroll-shell *::-webkit-scrollbar-thumb {
          background: rgba(148, 163, 184, 0.55);
          border-radius: 9999px;
          border: 2px solid transparent;
          background-clip: content-box;
        }
        .test-ai-scroll-shell *::-webkit-scrollbar-thumb:hover {
          background: rgba(100, 116, 139, 0.7);
          border-radius: 9999px;
          border: 2px solid transparent;
          background-clip: content-box;
        }
        .test-ai-scroll-shell *::-webkit-scrollbar-button {
          display: none;
          width: 0;
          height: 0;
        }
        .test-ai-scroll-shell *::-webkit-scrollbar-corner {
          background: transparent;
        }
      `}</style>
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-1 flex-col px-8 pb-10 pt-6">
        {isEmptyState ? (
          <div className="flex min-h-[calc(100vh-180px)] flex-1 items-center justify-center">
            <div className="flex w-full max-w-4xl flex-col items-center">
              {titleHero}
              {composer}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col">
            <div className="mx-auto mb-4 flex w-full max-w-4xl justify-end">
              {state.output ? (
                <button
                  type="button"
                  onClick={() => setShowConversation((prev) => !prev)}
                  className="inline-flex items-center gap-2 rounded-full border border-[#4ECCA3]/20 bg-[#4ECCA3]/10 px-4 py-2 text-sm text-[#2E8D73] transition hover:bg-[#4ECCA3]/14"
                >
                  <span>{showConversation ? locale.common.hideConversation : locale.common.showConversation}</span>
                  <svg
                    className={`h-4 w-4 transition-transform ${showConversation ? 'rotate-180' : ''}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
              ) : null}
            </div>

            {showConversation && state.output ? (
              <div className="mx-auto mb-6 flex w-full max-w-4xl flex-col gap-5">
                <div className="self-end rounded-[26px] bg-[#eef8f4] px-5 py-3 text-[15px] leading-7 text-gray-900 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
                  {prompt}
                </div>
                <div className="rounded-[30px] border border-gray-200 bg-white px-6 py-5 shadow-[0_20px_45px_rgba(15,23,42,0.06)]">
                  <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
                    <span>{locale.common.assistant}</span>
                    {state.result === 'passed' ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] tracking-normal text-green-700">{locale.common.ready}</span>
                    ) : null}
                  </div>
                  <div className="whitespace-pre-wrap text-[15px] leading-8 text-gray-800">{asString(state.output)}</div>
                </div>
              </div>
            ) : null}

            {state.busy && !state.output ? (
              <div className="mx-auto mb-6 w-full max-w-4xl rounded-[28px] border border-gray-200 bg-white px-6 py-5 text-sm text-gray-600 shadow-[0_20px_45px_rgba(15,23,42,0.06)]">
                <div className="inline-flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-emerald-400 [animation-delay:-0.2s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-emerald-400 [animation-delay:-0.1s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-emerald-400" />
                  </span>
                  <span>{(state.busyLabel || locale.common.running).replace(/\.{3}$/, '')}</span>
                </div>
              </div>
            ) : null}

            {state.error ? (
              <div className="mx-auto mb-6 w-full max-w-4xl rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {state.error}
              </div>
            ) : null}

            <div className="mx-auto mt-2 w-full max-w-4xl shrink-0">
              {titleHero}
              {composer}
            </div>

            {state.busy && state.busyLabel === locale.textGenerate.warmingLocalModel ? (
              <div className="mt-4">
                <InfoBox message={locale.textGenerate.prewarmingNotice} />
              </div>
            ) : null}

            {(state.rawResponse || state.diagnostics.requestParams || state.diagnostics.resolvedRoute || state.diagnostics.responseMetadata) ? (
              <div className="mt-4 pb-8">
                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                  <button
                    type="button"
                    onClick={() => setShowDeveloperDetails((prev) => !prev)}
                    className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-gray-700"
                  >
                    <svg
                      className={`h-4 w-4 transition-transform ${showDeveloperDetails ? 'rotate-90' : ''}`}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="m9 6 6 6-6 6" />
                    </svg>
                    <span>{locale.common.developerDetails}</span>
                  </button>
                  {showDeveloperDetails ? (
                    <div className="border-t border-gray-200 p-4">
                      <div className="space-y-4 pb-4">
                        <DiagnosticsPanel diagnostics={state.diagnostics} />
                        {state.rawResponse ? <RawJsonSection content={state.rawResponse} /> : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {showRouteDialog ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/25 px-6">
          <div className="w-full max-w-2xl rounded-[30px] bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.2)]">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold text-gray-950">{locale.route.dialogTitle}</div>
                <div className="mt-1 text-sm text-gray-500">
                  {locale.route.dialogDescription}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRouteDialog(false)}
                className="rounded-full border border-gray-200 p-2 text-gray-500 transition hover:border-gray-300 hover:text-gray-700"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
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
                  options={sourceOptions}
                  onChange={(value) => applySource(value as RuntimeRouteSource)}
                  disabled={!state.snapshot}
                />
              </label>
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-gray-500">{locale.route.connector}</span>
                <RouteSelect
                  value={activeSource === 'cloud' ? activeConnectorId : ''}
                  options={connectorOptions}
                  onChange={applyConnector}
                  disabled={!state.snapshot || activeSource !== 'cloud'}
                />
              </label>
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-gray-500">{locale.route.model}</span>
                <RouteSelect
                  value={activeModelInOptions ? activeModel : ''}
                  options={modelSelectOptions}
                  onChange={applyManualModel}
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
              <span className="text-gray-500">{locale.route.manualModelOverride}</span>
              <input
                className="rounded-2xl border border-gray-200 bg-white px-3 py-3 outline-none focus:border-[#4ECCA3]"
                value={manualModelDraft}
                onChange={(event) => setManualModelDraft(event.target.value)}
                onBlur={() => applyManualModel(manualModelDraft)}
                placeholder={locale.route.modelIdPlaceholder}
              />
            </label>

            <div className="mt-6 flex items-center justify-between">
              <button
                type="button"
                onClick={onRouteReload}
                disabled={state.routeLoading}
                className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 transition hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50"
              >
                {state.routeLoading ? locale.common.refreshing : locale.common.refresh}
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onStateChange((prev) => ({ ...prev, binding: null }))}
                  className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
                >
                  {locale.common.useDefault}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    applyManualModel(manualModelDraft);
                    setShowRouteDialog(false);
                  }}
                  className="rounded-full bg-[#111827] px-4 py-2 text-sm text-white transition hover:bg-[#1f2937]"
                >
                  {locale.common.done}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
