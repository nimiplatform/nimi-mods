import React from 'react';
import { CAPABILITIES, asString, bindingForConnector, bindingForModel, bindingForSource, capabilityCopy, resolveRouteModelPickerState, toPrettyJson, useTestAiLocale, } from './core.js';
import type { CapabilityId, CapabilityState, CapabilityStates, DiagnosticsInfo, } from './core.js';
import { type RuntimeRouteBinding, type RuntimeRouteOptionsSnapshot, type RuntimeRouteSource } from "@nimiplatform/sdk/mod";
type RouteBindingEditorProps = {
    capabilityId: CapabilityId;
    snapshot: RuntimeRouteOptionsSnapshot | null;
    binding: RuntimeRouteBinding | null;
    loading: boolean;
    error: string;
    onReload: () => void;
    onBindingChange: (binding: RuntimeRouteBinding | null) => void;
};
export function RouteBindingEditor(props: RouteBindingEditorProps) {
    const locale = useTestAiLocale();
    const { effectiveBinding, activeSource, activeConnectorId, activeModel, modelOptions, cloudCatalogMissing, activeModelInOptions, } = resolveRouteModelPickerState(props.snapshot, props.binding);
    const activeConnector = props.snapshot?.connectors.find((item) => item.id === activeConnectorId) || null;
    const tokenConnectors = props.snapshot?.connectors || [];
    const [modelDraft, setModelDraft] = React.useState(activeModel);
    const [showManualModelOverride, setShowManualModelOverride] = React.useState(false);
    React.useEffect(() => {
        setModelDraft(activeModel);
    }, [activeModel]);
    React.useEffect(() => {
        if (cloudCatalogMissing || (asString(activeModel) && !activeModelInOptions)) {
            setShowManualModelOverride(true);
        }
    }, [cloudCatalogMissing, activeModel, activeModelInOptions]);
    return (<div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-700">{locale.route.title}</span>
        <div className="flex items-center gap-2">
          <button type="button" className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs" disabled={props.loading} onClick={props.onReload}>
            {props.loading ? locale.common.refreshing : locale.common.refresh}
          </button>
          <button type="button" className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs" onClick={() => props.onBindingChange(null)}>
            {locale.common.useDefault}
          </button>
        </div>
      </div>
      {props.error ? (<div className="mb-2 rounded-md bg-amber-50 p-2 text-xs text-amber-700">{props.error}</div>) : null}
      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-gray-500">{locale.route.source}</span>
          <select className="rounded-md border border-gray-300 bg-white px-2 py-1" value={activeSource} onChange={(event) => {
            props.onBindingChange(bindingForSource(props.snapshot, event.target.value as RuntimeRouteSource));
        }} disabled={!props.snapshot}>
            <option value="local">{locale.common.local}</option>
            <option value="cloud">{locale.common.cloud}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-gray-500">{locale.route.connector}</span>
          <select className="rounded-md border border-gray-300 bg-white px-2 py-1" value={activeSource === 'cloud' ? activeConnectorId : ''} onChange={(event) => {
            props.onBindingChange(bindingForConnector(props.snapshot, event.target.value, effectiveBinding));
        }} disabled={!props.snapshot || activeSource !== 'cloud'}>
            <option value="">{locale.common.none}</option>
            {tokenConnectors.map((connector) => (<option key={connector.id} value={connector.id}>
                {connector.label || connector.id}
              </option>))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-gray-500">{locale.route.model}</span>
          <select className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs" value={activeModelInOptions ? activeModel : ''} onChange={(event) => {
            if (!asString(event.target.value))
                return;
            props.onBindingChange(bindingForModel(props.snapshot, event.target.value, effectiveBinding));
        }} disabled={!props.snapshot || modelOptions.length === 0}>
            <option value="">
              {modelOptions.length === 0
            ? (activeSource === 'cloud' ? locale.route.connectorCatalogMissingModels : locale.route.noLocalModels)
            : locale.route.selectModel}
            </option>
            {modelOptions.map((model) => (<option key={model} value={model}>{model}</option>))}
          </select>
        </label>
      </div>
      {cloudCatalogMissing ? (<div className="mt-2 rounded-md bg-amber-50 p-2 text-xs text-amber-700">
          {locale.route.connectorCatalogMissingHelp}
        </div>) : null}
      <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
        <span>
          {activeSource === 'cloud'
            ? `${locale.common.provider.toLowerCase()}: ${activeConnector?.provider || effectiveBinding?.provider || locale.common.unknown}`
            : locale.route.localCatalogSummary}
        </span>
        <button type="button" className="text-blue-600 hover:underline" onClick={() => setShowManualModelOverride((prev) => !prev)}>
          {showManualModelOverride ? locale.route.hideManualOverride : locale.route.manualOverride}
        </button>
      </div>
      {showManualModelOverride ? (<label className="mt-2 flex flex-col gap-1 text-xs">
          <span className="text-gray-500">{locale.route.manualModelOverride}</span>
          <input className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs" value={modelDraft} onChange={(event) => {
                const nextValue = event.target.value;
                setModelDraft(nextValue);
                if (!asString(nextValue))
                    return;
                props.onBindingChange(bindingForModel(props.snapshot, nextValue, effectiveBinding));
            }} disabled={!props.snapshot} placeholder={locale.route.modelIdPlaceholder}/>
        </label>) : null}
      <div className="mt-1.5 text-xs text-gray-500">
        {effectiveBinding
            ? `${effectiveBinding.source} · ${effectiveBinding.provider || '—'} · ${effectiveBinding.connectorId || '—'} · ${effectiveBinding.model || '—'}`
            : locale.route.runtimeDefault}
      </div>
      {effectiveBinding?.source === 'local' ? (<div className="mt-1 text-xs text-gray-500">
          {`adapter=${effectiveBinding.adapter || '—'} · go-runtime=${effectiveBinding.goRuntimeStatus || locale.common.unknown} · localModelId=${effectiveBinding.localModelId || '—'}`}
        </div>) : null}
    </div>);
}
// ── DiagnosticsPanel ──────────────────────────────────────────────────────────
function KVRow(props: {
    label: string;
    value: string | number | undefined | null;
    mono?: boolean;
    highlight?: 'green' | 'red' | 'blue' | 'gray';
}) {
    if (props.value === undefined || props.value === null || props.value === '')
        return null;
    const colorMap = {
        green: 'text-green-700',
        red: 'text-red-700',
        blue: 'text-blue-700',
        gray: 'text-gray-500',
    };
    const valueClass = props.mono
        ? `font-mono ${props.highlight ? colorMap[props.highlight] : 'text-gray-900'}`
        : (props.highlight ? colorMap[props.highlight] : 'text-gray-900');
    return (<div className="grid grid-cols-[140px_1fr] gap-x-2 py-0.5">
      <span className="text-gray-400 truncate">{props.label}</span>
      <span className={`truncate ${valueClass}`}>{String(props.value)}</span>
    </div>);
}
type DiagnosticsPanelProps = {
    diagnostics: DiagnosticsInfo;
};
export function DiagnosticsPanel(props: DiagnosticsPanelProps) {
    const locale = useTestAiLocale();
    const { diagnostics } = props;
    if (!diagnostics.requestParams && !diagnostics.resolvedRoute && !diagnostics.responseMetadata) {
        return null;
    }
    const meta = diagnostics.responseMetadata;
    const route = diagnostics.resolvedRoute;
    const params = diagnostics.requestParams;
    return (<div className="flex flex-col gap-2 text-xs">
      {/* Request Params */}
      {params ? (<div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="mb-1.5 font-semibold text-gray-600">{locale.diagnostics.requestParams}</div>
          {Object.entries(params).map(([k, v]) => {
                if (v === undefined || v === null || v === '')
                    return null;
                const displayValue = typeof v === 'object' ? toPrettyJson(v) : String(v);
                if (displayValue.length > 200 || displayValue.includes('\n')) {
                    return (<div key={k} className="mb-1">
                  <span className="text-gray-400">{k}</span>
                  <pre className="mt-0.5 whitespace-pre-wrap break-all rounded bg-gray-50 px-2 py-1 font-mono text-xs text-gray-900">{displayValue}</pre>
                </div>);
                }
                return <KVRow key={k} label={k} value={displayValue} mono/>;
            })}
        </div>) : null}

      {/* Route Preview */}
      {route ? (<div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="mb-1.5 font-semibold text-gray-600">{locale.diagnostics.routePreview}</div>
          <KVRow label="source" value={route.source} mono highlight="blue"/>
          <KVRow label="provider" value={route.provider} mono/>
          <KVRow label="modelSelector" value={route.model} mono/>
          <KVRow label="modelId" value={route.modelId} mono/>
          <KVRow label="connectorId" value={route.connectorId} mono/>
          <KVRow label="endpoint" value={route.endpoint} mono/>
          <KVRow label="adapter" value={route.adapter} mono/>
          <KVRow label="engine" value={route.engine} mono/>
          <KVRow label="localModelId" value={route.localModelId} mono/>
          <KVRow label="goRuntimeLocalModelId" value={route.goRuntimeLocalModelId} mono/>
          <KVRow label="goRuntimeStatus" value={route.goRuntimeStatus} mono/>
          <KVRow label="localProviderEndpoint" value={route.localProviderEndpoint} mono/>
        </div>) : null}

      {/* Response Metadata */}
      {meta ? (<div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="mb-1.5 font-semibold text-gray-600">{locale.diagnostics.responseMetadata}</div>
          {meta.elapsed !== undefined ? (<KVRow label="elapsed" value={`${meta.elapsed} ms`} highlight="blue"/>) : null}
          {meta.finishReason !== undefined ? (<KVRow label="finishReason" value={meta.finishReason} mono highlight={meta.finishReason === 'stop' ? 'green' : meta.finishReason === 'error' ? 'red' : undefined}/>) : null}
          {meta.inputTokens !== undefined ? (<KVRow label="inputTokens" value={meta.inputTokens}/>) : null}
          {meta.outputTokens !== undefined ? (<KVRow label="outputTokens" value={meta.outputTokens}/>) : null}
          {meta.totalTokens !== undefined ? (<KVRow label="totalTokens" value={meta.totalTokens}/>) : null}
          {meta.traceId ? (<KVRow label="traceId" value={meta.traceId} mono/>) : null}
          {meta.modelResolved ? (<KVRow label="modelResolved" value={meta.modelResolved} mono/>) : null}
          {meta.jobId ? (<KVRow label="jobId" value={meta.jobId} mono/>) : null}
          {meta.artifactCount !== undefined ? (<KVRow label="artifacts" value={meta.artifactCount}/>) : null}
        </div>) : null}
    </div>);
}
// ── Sidebar ───────────────────────────────────────────────────────────────────
type SidebarProps = {
    active: CapabilityId;
    states: CapabilityStates;
    onSelect: (id: CapabilityId) => void;
};
export function CapabilitySidebar(props: SidebarProps) {
    const locale = useTestAiLocale();
    return (<nav className="flex w-44 shrink-0 flex-col gap-1 overflow-y-auto border-r border-gray-200 bg-white p-2">
      <div className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
        {locale.sidebar.title}
      </div>
      {CAPABILITIES.map((cap) => {
            const state = props.states[cap.id];
            const isActive = props.active === cap.id;
            const capCopy = capabilityCopy(locale, cap.id);
            let statusIcon = '○';
            let statusColor = 'text-gray-400';
            if (state.result === 'passed') {
                statusIcon = '✓';
                statusColor = 'text-green-500';
            }
            if (state.result === 'failed') {
                statusIcon = '✗';
                statusColor = 'text-red-500';
            }
            if (state.busy) {
                statusIcon = '…';
                statusColor = 'text-blue-500';
            }
            return (<button key={cap.id} type="button" onClick={() => props.onSelect(cap.id)} className={[
                    'flex items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors',
                    isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100',
                ].join(' ')}>
            <span className={`shrink-0 text-sm font-mono ${statusColor}`}>{statusIcon}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">{capCopy.label}</div>
              <div className="truncate text-xs text-gray-400">{capCopy.description}</div>
            </div>
          </button>);
        })}
    </nav>);
}
// ── Shared UI atoms ───────────────────────────────────────────────────────────
export function RunButton(props: {
    busy: boolean;
    busyLabel?: string;
    label: string;
    onClick: () => void;
}) {
    const locale = useTestAiLocale();
    return (<button type="button" className="inline-flex self-start items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50" disabled={props.busy} onClick={props.onClick}>
      {props.busy ? (<>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/90 [animation-delay:-0.2s]"/>
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/90 [animation-delay:-0.1s]"/>
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/90"/>
          </span>
          <span>{(asString(props.busyLabel) || locale.common.running).replace(/\.{3}$/, '')}</span>
        </>) : props.label}
    </button>);
}
export function ErrorBox(props: {
    message: string;
}) {
    return (<div className="rounded-md bg-red-50 p-2 text-xs text-red-700">{props.message}</div>);
}
export function InfoBox(props: {
    message: string;
}) {
    return (<div className="rounded-md bg-blue-50 p-2 text-xs text-blue-700">{props.message}</div>);
}
export function RawJsonSection(props: {
    content: string;
}) {
    const locale = useTestAiLocale();
    const [copied, setCopied] = React.useState(false);
    const handleCopy = React.useCallback(() => {
        void navigator.clipboard.writeText(props.content).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    }, [props.content]);
    return (<button type="button" onClick={handleCopy} className="rounded border border-gray-300 bg-white px-3 py-1 text-xs text-gray-500 hover:bg-gray-100 active:bg-gray-200">
      {copied ? `✓ ${locale.common.copied}` : locale.common.copyRawJson}
    </button>);
}
