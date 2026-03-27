import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  filterModelOptions,
  normalizeRuntimeRouteSource,
  parseRuntimeRouteOptions,
  type ModRuntimeClient,
  type RuntimeCanonicalCapability,
  type RuntimeRouteBinding,
  type RuntimeRouteOptionsSnapshot,
} from '@nimiplatform/sdk/mod';
import { useModTranslation } from '@nimiplatform/sdk/mod';

type AgentCaptureSettingsDrawerProps = {
  open: boolean;
  onClose: () => void;
  runtimeClient: ModRuntimeClient;
  textRouteBinding: RuntimeRouteBinding | null;
  imageRouteBinding: RuntimeRouteBinding | null;
  onTextRouteBindingChange: (binding: RuntimeRouteBinding | null) => void;
  onImageRouteBindingChange: (binding: RuntimeRouteBinding | null) => void;
};

function dedupeModelIds(models: string[]): string[] {
  return Array.from(new Set(models.map((item) => String(item || '').trim()).filter(Boolean)));
}

function toDefaultBinding(
  binding: RuntimeRouteBinding | null,
  routeOptions: RuntimeRouteOptionsSnapshot | null,
): RuntimeRouteBinding {
  if (binding) return binding;
  if (routeOptions?.selected) return routeOptions.selected;
  return {
    source: 'local',
    connectorId: '',
    model: '',
  };
}

function useRouteOptions(input: {
  runtimeClient: ModRuntimeClient;
  capability: RuntimeCanonicalCapability;
  open: boolean;
}) {
  const [routeOptions, setRouteOptions] = useState<RuntimeRouteOptionsSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef<Promise<RuntimeRouteOptionsSnapshot | null> | null>(null);

  const load = React.useCallback(async (options?: { forceRefresh?: boolean }) => {
    if (inFlightRef.current && !options?.forceRefresh) {
      return inFlightRef.current;
    }
    const task = (async () => {
      setLoading(true);
      setError(null);
      try {
        const payload = await input.runtimeClient.route.listOptions({
          capability: input.capability,
        });
        const parsed = parseRuntimeRouteOptions(payload, { includeResolvedDefault: true });
        if (!parsed) {
          throw new Error('AGENT_CAPTURE_ROUTE_OPTIONS_INVALID');
        }
        setRouteOptions(parsed);
        return parsed;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error || 'AGENT_CAPTURE_ROUTE_OPTIONS_FAILED');
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    })();
    inFlightRef.current = task;
    void task.finally(() => {
      if (inFlightRef.current === task) {
        inFlightRef.current = null;
      }
    });
    return task;
  }, [input.capability, input.runtimeClient]);

  useEffect(() => {
    if (!input.open) return;
    void load();
  }, [input.open, load]);

  return {
    routeOptions,
    loading,
    error,
    reload: load,
  };
}

function RoutePanel(input: {
  title: string;
  subtitle: string;
  binding: RuntimeRouteBinding | null;
  routeOptions: RuntimeRouteOptionsSnapshot | null;
  loading: boolean;
  onReload: () => void;
  onChange: (binding: RuntimeRouteBinding | null) => void;
}) {
  const { t } = useModTranslation('agent-capture');
  const effectiveBinding = toDefaultBinding(input.binding, input.routeOptions);
  const activeSource = effectiveBinding.source;
  const connectors = input.routeOptions?.connectors || [];
  const activeConnectorId = activeSource === 'cloud'
    ? (effectiveBinding.connectorId || connectors[0]?.id || '')
    : '';
  const activeConnector = connectors.find((item) => item.id === activeConnectorId) || connectors[0] || null;
  const modelOptionsRaw = activeSource === 'local'
    ? (input.routeOptions?.local?.models.map((item) => item.model) || [])
    : (activeConnector?.models || []);
  const modelOptions = useMemo(() => dedupeModelIds(modelOptionsRaw), [modelOptionsRaw]);
  const [modelQuery, setModelQuery] = useState(effectiveBinding.model || '');

  useEffect(() => {
    setModelQuery(effectiveBinding.model || '');
  }, [effectiveBinding.model]);

  const filteredModelOptions = useMemo(
    () => filterModelOptions(modelOptions, modelQuery),
    [modelOptions, modelQuery],
  );

  const applyModel = (model: string) => {
    const normalized = String(model || '').trim();
    if (!normalized) {
      input.onChange(null);
      return;
    }
    if (!modelOptions.includes(normalized)) {
      setModelQuery(effectiveBinding.model || '');
      return;
    }
    const matchedLocalModel = input.routeOptions?.local?.models.find((item) => item.model === normalized) || null;
    input.onChange(activeSource === 'cloud'
      ? {
          source: 'cloud',
          connectorId: activeConnectorId,
          model: normalized,
        }
      : {
          source: 'local',
          connectorId: '',
          model: normalized,
          localModelId: matchedLocalModel?.localModelId,
          engine: matchedLocalModel?.engine,
          modelId: matchedLocalModel?.modelId,
          provider: matchedLocalModel?.provider,
          adapter: matchedLocalModel?.adapter,
          endpoint: matchedLocalModel?.endpoint,
          goRuntimeLocalModelId: matchedLocalModel?.goRuntimeLocalModelId,
          goRuntimeStatus: matchedLocalModel?.goRuntimeStatus,
        });
  };

  return (
    <section className="space-y-4 rounded-[24px] border border-white/80 bg-white/88 p-4 shadow-[0_4px_16px_rgba(15,23,42,0.04)]">
      <div>
        <p className="text-sm font-semibold text-gray-900">{input.title}</p>
        <p className="mt-1 text-xs text-gray-500">{input.subtitle}</p>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-gray-500">{t('settings.source')}</p>
        <select
          value={activeSource}
          onChange={(event) => {
            const source = normalizeRuntimeRouteSource(event.target.value);
            if (source === 'cloud') {
              const connector = connectors[0] || null;
              input.onChange({
                source: 'cloud',
                connectorId: connector?.id || '',
                model: connector?.models[0] || '',
              });
              return;
            }
            const localModel = input.routeOptions?.local?.models[0] || null;
            input.onChange(localModel ? {
              source: 'local',
              connectorId: '',
              model: localModel.model,
              localModelId: localModel.localModelId,
              engine: localModel.engine,
              modelId: localModel.modelId,
              provider: localModel.provider,
              adapter: localModel.adapter,
              endpoint: localModel.endpoint,
              goRuntimeLocalModelId: localModel.goRuntimeLocalModelId,
              goRuntimeStatus: localModel.goRuntimeStatus,
            } : {
              source: 'local',
              connectorId: '',
              model: '',
            });
          }}
          disabled={!input.routeOptions}
          className="h-10 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm text-gray-900 disabled:bg-gray-100 disabled:text-gray-400"
        >
          <option value="local">{t('settings.sourceLocal')}</option>
          <option value="cloud">{t('settings.sourceCloud')}</option>
        </select>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-gray-500">{t('settings.connector')}</p>
        <select
          value={activeConnectorId}
          disabled={!input.routeOptions || activeSource !== 'cloud'}
          onChange={(event) => {
            const connectorId = event.target.value;
            const connector = connectors.find((item) => item.id === connectorId) || null;
            input.onChange({
              source: 'cloud',
              connectorId,
              model: connector?.models[0] || '',
            });
          }}
          className="h-10 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm text-gray-900 disabled:bg-gray-100 disabled:text-gray-400"
        >
          <option value="">--</option>
          {connectors.map((connector) => (
            <option key={`${input.title}-${connector.id}`} value={connector.id}>
              {connector.label || connector.id}
            </option>
          ))}
        </select>
        {activeSource === 'cloud' && connectors.length === 0 ? (
          <p className="mt-1 text-[11px] text-amber-700">{t('settings.noConnectors')}</p>
        ) : null}
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-gray-500">{t('settings.model')}</p>
        <input
          list={`${input.title}-model-list`}
          value={modelQuery}
          onChange={(event) => {
            const nextValue = event.target.value;
            setModelQuery(nextValue);
            if (modelOptions.includes(nextValue)) {
              applyModel(nextValue);
            }
          }}
          onBlur={() => applyModel(modelQuery)}
          placeholder={t('settings.modelPlaceholder')}
          disabled={!input.routeOptions}
          className="h-10 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition-colors focus:border-[#4ECCA3] focus:ring-1 focus:ring-[#4ECCA3] disabled:bg-gray-100 disabled:text-gray-400"
        />
        <datalist id={`${input.title}-model-list`}>
          {filteredModelOptions.map((model) => (
            <option key={`${input.title}-${model}`} value={model} />
          ))}
        </datalist>
        {modelOptions.length === 0 ? <p className="mt-1 text-[11px] text-amber-700">{t('settings.noModels')}</p> : null}
        {modelOptions.length > 0 && filteredModelOptions.length === 0 ? <p className="mt-1 text-[11px] text-amber-700">{t('settings.noMatchingModels')}</p> : null}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => input.onChange(null)}
          className="h-10 flex-1 rounded-2xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700"
        >
          {t('settings.useRuntimeDefault')}
        </button>
        <button
          type="button"
          onClick={input.onReload}
          disabled={input.loading}
          className="h-10 rounded-2xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 disabled:opacity-50"
        >
          {input.loading ? t('settings.loading') : t('settings.reload')}
        </button>
      </div>
    </section>
  );
}

export function AgentCaptureSettingsDrawer(input: AgentCaptureSettingsDrawerProps) {
  const { t } = useModTranslation('agent-capture');
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const openRafRef = useRef<number | null>(null);
  const [hasOpened, setHasOpened] = useState(false);
  const [openVersion, setOpenVersion] = useState(0);
  const textOptions = useRouteOptions({
    runtimeClient: input.runtimeClient,
    capability: 'text.generate',
    open: input.open,
  });
  const imageOptions = useRouteOptions({
    runtimeClient: input.runtimeClient,
    capability: 'image.generate',
    open: input.open,
  });

  useLayoutEffect(() => {
    if (!input.open) return;
    const resetScroller = () => {
      if (!scrollerRef.current) return;
      scrollerRef.current.scrollTop = 0;
    };
    resetScroller();
    const frame = () => {
      resetScroller();
      openRafRef.current = window.requestAnimationFrame(() => {
        resetScroller();
        openRafRef.current = window.requestAnimationFrame(resetScroller);
      });
    };
    openRafRef.current = window.requestAnimationFrame(frame);
    return () => {
      if (openRafRef.current !== null) {
        window.cancelAnimationFrame(openRafRef.current);
        openRafRef.current = null;
      }
    };
  }, [input.open]);

  useEffect(() => {
    if (!input.open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        input.onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [input.open, input.onClose]);

  useEffect(() => {
    if (input.open && !hasOpened) {
      setHasOpened(true);
    }
  }, [input.open, hasOpened]);

  useEffect(() => {
    if (!input.open) return;
    setOpenVersion((value) => value + 1);
  }, [input.open]);

  if (!hasOpened) {
    return null;
  }

  return (
    <>
      <div
        className={`absolute inset-0 z-20 bg-slate-900/12 backdrop-blur-[1px] transition-opacity duration-300 ${input.open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={input.onClose}
        aria-hidden={!input.open}
      />

      <aside
        className={`absolute inset-y-0 right-0 z-30 w-[380px] max-w-[92vw] overflow-hidden border-l border-white/60 bg-[#f7fbfb] shadow-[-12px_0_28px_rgba(15,23,42,0.1)] transition-transform duration-300 ease-[cubic-bezier(0.2,0.7,0.2,1)] will-change-transform transform-gpu ${input.open ? 'translate-x-0' : 'translate-x-full pointer-events-none'}`}
        aria-hidden={!input.open}
        role="dialog"
        aria-modal="true"
        onWheelCapture={(event) => event.stopPropagation()}
        onTouchMoveCapture={(event) => event.stopPropagation()}
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="shrink-0 border-b border-gray-200 bg-[#f7fbfb] px-4 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">{t('settings.title')}</p>
                <p className="mt-1 text-xs text-gray-500">{t('settings.subtitle')}</p>
              </div>
              <button
                type="button"
                onClick={input.onClose}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600"
                aria-label={t('settings.close')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          <div
            key={`settings-scroller-${openVersion}`}
            ref={scrollerRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-none px-4 py-4"
            style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
          >
            <div className="space-y-4">
              <section className="space-y-3 rounded-[24px] border border-white/80 bg-white/88 p-4 shadow-[0_4px_16px_rgba(15,23,42,0.04)]">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">{t('settings.routeKicker')}</p>
                  <p className="mt-2 text-sm text-gray-600">{t('settings.routeHint')}</p>
                </div>
                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/80 px-3 py-2 text-xs leading-5 text-gray-500">
                  {t('settings.storedNote')}
                </div>
              </section>

              <RoutePanel
                title={t('settings.textTitle')}
                subtitle={t('settings.textSubtitle')}
                binding={input.textRouteBinding}
                routeOptions={textOptions.routeOptions}
                loading={textOptions.loading}
                onReload={() => { void textOptions.reload({ forceRefresh: true }); }}
                onChange={input.onTextRouteBindingChange}
              />

              <RoutePanel
                title={t('settings.imageTitle')}
                subtitle={t('settings.imageSubtitle')}
                binding={input.imageRouteBinding}
                routeOptions={imageOptions.routeOptions}
                loading={imageOptions.loading}
                onReload={() => { void imageOptions.reload({ forceRefresh: true }); }}
                onChange={input.onImageRouteBindingChange}
              />
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
