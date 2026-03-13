import React, { useEffect, useState } from 'react';
import { RouteCapabilityControls } from '../components/route-capability-controls.js';
import type {
  WorldStudioActionsSlice,
  WorldStudioRoutingSlice,
} from '../controllers/world-studio-screen-model.js';
import { worldStudioMessage } from '../i18n/messages.js';

function SectionCard(props: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="space-y-3 rounded-[24px] border border-white/80 bg-white/88 p-4 shadow-[0_4px_16px_rgba(15,23,42,0.04)]">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">{props.title}</p>
        {props.hint ? (
          <p className="mt-1 text-[13px] leading-6 text-gray-600">{props.hint}</p>
        ) : null}
      </div>
      {props.children}
    </section>
  );
}

function CollapsibleSection(props: {
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60">
      <button
        type="button"
        onClick={props.onToggle}
        className="flex h-9 w-full items-center justify-between px-3 text-left"
      >
        <div>
          <p className="text-[13px] font-semibold text-gray-900">{props.title}</p>
          <p className="mt-0.5 text-[11px] text-gray-500">{props.summary}</p>
        </div>
        <span className={`text-gray-400 transition-transform duration-200 ${props.open ? 'rotate-180' : ''}`}>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 7.5L10 12.5L15 7.5" />
          </svg>
        </span>
      </button>
      {props.open ? (
        <div className="border-t border-white/70 px-3 pb-3 pt-3">
          {props.children}
        </div>
      ) : null}
    </div>
  );
}

function DetailRow(props: {
  label: string;
  value: string;
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-3 text-[12px]">
      <span className="text-slate-500">{props.label}</span>
      <span className="max-w-[62%] text-right font-medium text-slate-700">{props.value}</span>
    </div>
  );
}

function SummaryBadge(props: {
  children: React.ReactNode;
  tone?: 'default' | 'warning' | 'danger' | 'success';
}): React.ReactElement {
  const toneClass = props.tone === 'warning'
    ? 'border-amber-200 bg-amber-50 text-amber-700'
    : props.tone === 'danger'
      ? 'border-red-200 bg-red-50 text-red-700'
      : props.tone === 'success'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : 'border-slate-200 bg-white text-slate-600';
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${toneClass}`}>
      {props.children}
    </span>
  );
}

function resolveRouteSummary(binding: WorldStudioRoutingSlice['effectiveCoarseRouteBinding']): string {
  if (!binding) {
    return worldStudioMessage('routeConfig.notConfigured', 'Not configured');
  }
  const sourceLabel = binding.source === 'cloud'
    ? worldStudioMessage('routeCapabilityControls.sourceCloud', 'Cloud')
    : worldStudioMessage('routeCapabilityControls.sourceLocal', 'Local');
  const modelLabel = String(binding.model || '').trim();
  if (!modelLabel) {
    return sourceLabel;
  }
  return `${sourceLabel} · ${modelLabel}`;
}

export function SettingsDrawer(props: {
  routing: WorldStudioRoutingSlice;
  actions: WorldStudioActionsSlice;
}): React.ReactElement {
  const [coarseOpen, setCoarseOpen] = useState(!props.routing.routeConfigReady);
  const [fineOpen, setFineOpen] = useState(false);

  useEffect(() => {
    if (!props.routing.routeConfigReady) {
      setCoarseOpen(true);
      setFineOpen(true);
    }
  }, [props.routing.routeConfigReady]);

  return (
    <div className="space-y-4">
      <SectionCard
        title={worldStudioMessage('routeConfig.sectionTitle', '模型路由')}
        hint={worldStudioMessage('routeConfig.intro', 'World extraction and daily chat have different model requirements. Configure dedicated coarse/fine routes here.')}
      >
        <div className="space-y-3 rounded-2xl border border-dashed border-gray-200 bg-gray-50/80 px-3 py-3">
          <SummaryBadge tone={props.routing.routeConfigReady ? 'success' : 'warning'}>
            {props.routing.routeConfigReady
              ? worldStudioMessage('routeConfig.readyShort', 'Routes ready')
              : worldStudioMessage('routeConfig.notReadyShort', 'Routing required')}
          </SummaryBadge>
          <div className="space-y-2">
            <DetailRow
              label={worldStudioMessage('routeConfig.coarseSummary', 'Current coarse route')}
              value={resolveRouteSummary(props.routing.effectiveCoarseRouteBinding)}
            />
            <DetailRow
              label={worldStudioMessage('routeConfig.fineSummary', 'Current fine route')}
              value={resolveRouteSummary(props.routing.effectiveFineRouteBinding)}
            />
          </div>
        </div>

        <CollapsibleSection
          title={worldStudioMessage('routeConfig.coarseTitle', 'Coarse Route (INGEST/COARSE)')}
          summary={resolveRouteSummary(props.routing.effectiveCoarseRouteBinding)}
          open={coarseOpen}
          onToggle={() => setCoarseOpen((value) => !value)}
        >
          <RouteCapabilityControls
            profile="coarse"
            title={worldStudioMessage('routeConfig.coarseTitle', 'Coarse Route (INGEST/COARSE)')}
            activeSource={props.routing.activeCoarseRouteSource}
            activeConnectorId={props.routing.activeCoarseRouteConnectorId}
            binding={props.routing.effectiveCoarseRouteBinding}
            showTitle={false}
            connectors={props.routing.routeConnectors}
            modelOptions={props.routing.coarseRouteModelOptions}
            readiness={props.routing.coarseRouteReadiness}
            onRouteSourceChange={props.actions.routing.onRouteSourceChange}
            onRouteConnectorChange={props.actions.routing.onRouteConnectorChange}
            onRouteModelChange={props.actions.routing.onRouteModelChange}
            onClearRouteOverride={props.actions.routing.onClearRouteBinding}
            onOpenRuntimeSetup={props.actions.workflow.openRuntimeSetup}
          />
        </CollapsibleSection>

        <CollapsibleSection
          title={worldStudioMessage('routeConfig.fineTitle', 'Fine Route (FINE/SYNTHESIZE)')}
          summary={resolveRouteSummary(props.routing.effectiveFineRouteBinding)}
          open={fineOpen}
          onToggle={() => setFineOpen((value) => !value)}
        >
          <RouteCapabilityControls
            profile="fine"
            title={worldStudioMessage('routeConfig.fineTitle', 'Fine Route (FINE/SYNTHESIZE)')}
            activeSource={props.routing.activeFineRouteSource}
            activeConnectorId={props.routing.activeFineRouteConnectorId}
            binding={props.routing.effectiveFineRouteBinding}
            showTitle={false}
            connectors={props.routing.routeConnectors}
            modelOptions={props.routing.fineRouteModelOptions}
            readiness={props.routing.fineRouteReadiness}
            onRouteSourceChange={props.actions.routing.onRouteSourceChange}
            onRouteConnectorChange={props.actions.routing.onRouteConnectorChange}
            onRouteModelChange={props.actions.routing.onRouteModelChange}
            onClearRouteOverride={props.actions.routing.onClearRouteBinding}
            onOpenRuntimeSetup={props.actions.workflow.openRuntimeSetup}
          />
        </CollapsibleSection>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="h-8 rounded-xl border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700"
            onClick={() => props.actions.routing.onClearRouteBinding('all')}
          >
            {worldStudioMessage('routeConfig.resetAll', 'Reset All Overrides')}
          </button>
          {!props.routing.routeConfigReady && props.actions.workflow.openRuntimeSetup ? (
            <button
              type="button"
              className="h-8 rounded-xl border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700"
              onClick={props.actions.workflow.openRuntimeSetup}
            >
              {worldStudioMessage('routeConfig.goRuntime', 'Open AI Runtime')}
            </button>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard
        title={worldStudioMessage('routeConfig.embeddingIndexTitle', 'Embedding Index')}
        hint={props.routing.embeddingReadiness.message}
      >
        <div className="space-y-3 rounded-2xl border border-dashed border-gray-200 bg-gray-50/80 px-3 py-3 text-xs text-gray-600">
          <div className="flex flex-wrap gap-2">
            <SummaryBadge tone={props.routing.embeddingReadiness.healthy ? 'success' : 'warning'}>
              {`${worldStudioMessage('routeConfig.embeddingStatus', 'Status')}: ${props.routing.embeddingIndexStatus}`}
            </SummaryBadge>
            <SummaryBadge>
              {`${worldStudioMessage('routeConfig.embeddingEntries', 'Entries')}: ${props.routing.embeddingEntryCount}`}
            </SummaryBadge>
          </div>
          {props.routing.embeddingIndexLastBuiltAt ? (
            <p>
              {`${worldStudioMessage('routeConfig.embeddingLastBuiltAt', 'Last Built At')}: ${props.routing.embeddingIndexLastBuiltAt}`}
            </p>
          ) : null}
          {props.routing.embeddingIndexErrorMessage ? (
            <p className="break-all text-red-700">
              {`${worldStudioMessage('settingsDrawer.errorLabel', 'Error')}: ${props.routing.embeddingIndexErrorMessage}`}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="h-8 rounded-xl border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700"
            onClick={() => {
              void props.actions.routing.onRebuildEmbeddingIndex();
            }}
          >
            {worldStudioMessage('routeConfig.rebuildEmbeddingIndex', 'Rebuild Embedding Index')}
          </button>
          {!props.routing.embeddingReadiness.healthy && props.actions.workflow.openRuntimeSetup ? (
            <button
              type="button"
              className="h-8 rounded-xl border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700"
              onClick={props.actions.workflow.openRuntimeSetup}
            >
              {worldStudioMessage('routeConfig.goRuntime', 'Open AI Runtime')}
            </button>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
