// ---------------------------------------------------------------------------
// Settings page — redesigned with card-grouped layout
// ---------------------------------------------------------------------------

import React, { useCallback, useMemo } from 'react';
import type { RuntimeRouteOptionsSnapshot } from '@nimiplatform/sdk/mod/runtime-route';
import type { KBSettings } from '../../types.js';
import { Button } from '../ui/button.js';

type SettingsPageProps = {
  settings: KBSettings;
  onUpdate: (patch: Partial<KBSettings>) => void;
  chatRouteOptions: RuntimeRouteOptionsSnapshot | null;
  embeddingRouteOptions: RuntimeRouteOptionsSnapshot | null;
  onRefreshRouteOptions?: () => void;
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SettingsCard({ title, description, children }: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="mb-4">
        <h3 className="text-[15px] font-semibold text-gray-900">{title}</h3>
        {description && <p className="mt-1 text-xs text-gray-500">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-medium text-gray-700">{children}</label>;
}

function NumberField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel>{props.label}</FieldLabel>
      <input
        type="number"
        value={props.value}
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-900 focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-300"
      />
    </div>
  );
}

function SelectField(props: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel>{props.label}</FieldLabel>
      <select
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-900 focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-300"
      >
        {props.options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

function InputField(props: {
  label: string;
  value: string;
  placeholder?: string;
  listId?: string;
  onChange: (v: string) => void;
  children?: React.ReactNode; // for datalist
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel>{props.label}</FieldLabel>
      <input
        value={props.value}
        list={props.listId}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-900 placeholder:text-gray-400 focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-300"
      />
      {props.children}
    </div>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-10 shrink-0 cursor-pointer rounded-full transition-colors ${
        checked ? 'bg-indigo-600' : 'bg-gray-200'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-[18px] w-[18px] translate-y-[3px] rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-[19px]' : 'translate-x-[3px]'
        }`}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Route section for a single route (Chat or Embedding)
// ---------------------------------------------------------------------------

function asString(value: unknown): string {
  return String(value || '').trim();
}

function RoutePanel(props: {
  title: string;
  source: KBSettings['chatRouteSource'];
  connectorId: string;
  model: string;
  routeOptions: RuntimeRouteOptionsSnapshot | null;
  onSourceChange: (value: KBSettings['chatRouteSource']) => void;
  onConnectorChange: (value: string) => void;
  onModelChange: (value: string) => void;
  modelListId: string;
}) {
  const selectedConnector = useMemo(() => {
    const id = asString(props.connectorId);
    if (!id) return props.routeOptions?.connectors[0] || null;
    return props.routeOptions?.connectors.find((item) => item.id === id) || props.routeOptions?.connectors[0] || null;
  }, [props.connectorId, props.routeOptions]);

  const cloudModels = useMemo(() => {
    const models = selectedConnector?.models || [];
    const current = asString(props.model);
    if (!current || models.includes(current)) return models;
    return [current, ...models];
  }, [selectedConnector, props.model]);

  const localModels = useMemo(() => {
  const models = (props.routeOptions?.local?.models || []).map((item) => ({
      id: asString(item.localModelId),
      model: asString(item.model),
      label: asString(item.label || item.model || item.localModelId),
    })).filter((item) => item.model);
    const current = asString(props.model);
    if (current && !models.some((item) => item.model === current || item.id === current)) {
      models.unshift({ id: '', model: current, label: current });
    }
    return models;
  }, [props.routeOptions, props.model]);

  const effectiveConnectorId = asString(props.connectorId || selectedConnector?.id);

  return (
    <div className="flex-1 rounded-lg bg-gray-50 p-4">
      <h4 className="mb-3 text-xs font-semibold text-gray-700">{props.title}</h4>
      <div className="flex flex-col gap-3">
        <SelectField
          label="Source"
          value={props.source}
          options={[
            { value: 'auto', label: 'Auto (cloud-first)' },
            { value: 'cloud', label: 'Cloud' },
            { value: 'local', label: 'Local' },
          ]}
          onChange={(v) => props.onSourceChange(v as KBSettings['chatRouteSource'])}
        />

        {props.source === 'cloud' && (
          <>
            <SelectField
              label="Connector"
              value={effectiveConnectorId}
              options={[
                { value: '', label: '(auto)' },
                ...(props.routeOptions?.connectors || []).map((c) => ({
                  value: c.id,
                  label: c.label || c.id,
                })),
              ]}
              onChange={props.onConnectorChange}
            />
            <InputField
              label="Model"
              value={props.model}
              placeholder="Model id (auto if empty)"
              listId={props.modelListId}
              onChange={props.onModelChange}
            >
              <datalist id={props.modelListId}>
                {cloudModels.map((m) => (
                  <option key={`${props.title}-m-${m}`} value={m} />
                ))}
              </datalist>
            </InputField>
          </>
        )}

        {props.source === 'local' && (
          <SelectField
            label="Model"
            value={props.model}
            options={[
              { value: '', label: '(auto)' },
              ...localModels.map((item) => ({
                value: item.model,
                label: item.label,
              })),
            ]}
            onChange={props.onModelChange}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main settings page
// ---------------------------------------------------------------------------

export function SettingsPage(props: SettingsPageProps) {
  const { settings, onUpdate } = props;

  const handleChatRouteSourceChange = useCallback((value: KBSettings['chatRouteSource']) => {
    onUpdate({ chatRouteSource: value });
  }, [onUpdate]);

  const handleEmbeddingRouteSourceChange = useCallback((value: KBSettings['embeddingRouteSource']) => {
    onUpdate({ embeddingRouteSource: value });
  }, [onUpdate]);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="px-6 py-4">
        <h2 className="text-lg font-bold text-gray-900">Settings</h2>
      </div>

      <div className="flex flex-col gap-4 px-6 pb-6">
        {/* Card 1: Chunking */}
        <SettingsCard
          title="Chunking"
          description="Configure how documents are split into chunks for embedding"
        >
          <div className="grid grid-cols-2 gap-4">
            <NumberField
              label="Chunk Size (tokens)"
              value={settings.chunkSize}
              min={128}
              max={2048}
              onChange={(v) => onUpdate({ chunkSize: v })}
            />
            <NumberField
              label="Overlap (tokens)"
              value={settings.chunkOverlap}
              min={0}
              max={256}
              onChange={(v) => onUpdate({ chunkOverlap: v })}
            />
          </div>
          <p className="mt-3 text-[10px] text-gray-400">
            Changes do not affect already-processed documents. Re-import to apply new settings.
          </p>
        </SettingsCard>

        {/* Card 2: Retrieval */}
        <SettingsCard
          title="Retrieval"
          description="Control how documents are retrieved and ranked for queries"
        >
          <div className="grid grid-cols-3 gap-4">
            <NumberField
              label="Top K Results"
              value={settings.topK}
              min={1}
              max={20}
              onChange={(v) => onUpdate({ topK: v })}
            />
            <NumberField
              label="Similarity Threshold"
              value={settings.similarityThreshold}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => onUpdate({ similarityThreshold: v })}
            />
            <NumberField
              label="Max Context Chunks"
              value={settings.maxContextChunks}
              min={1}
              max={20}
              onChange={(v) => onUpdate({ maxContextChunks: v })}
            />
          </div>
        </SettingsCard>

        {/* Card 3: Query Rewriting */}
        <SettingsCard title="Query Rewriting" description="Expand multi-turn queries with context for better retrieval">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-700">Enable multi-turn query rewriting</p>
              <p className="mt-0.5 text-[10px] text-gray-400">
                Follow-up questions are rewritten to include conversation context for better search results.
              </p>
            </div>
            <ToggleSwitch
              checked={settings.queryRewritingEnabled}
              onChange={(v) => onUpdate({ queryRewritingEnabled: v })}
            />
          </div>
        </SettingsCard>

        {/* Card 4: Runtime Route */}
        <SettingsCard title="Runtime Route" description="Configure LLM and embedding model routing">
          <div className="mb-3 flex justify-end">
            {props.onRefreshRouteOptions && (
              <Button variant="secondary" size="sm" onClick={props.onRefreshRouteOptions}>
                Refresh
              </Button>
            )}
          </div>
          <div className="flex gap-4">
            <RoutePanel
              title="Chat Route"
              source={settings.chatRouteSource}
              connectorId={settings.chatConnectorId}
              model={settings.chatModel}
              routeOptions={props.chatRouteOptions}
              onSourceChange={handleChatRouteSourceChange}
              onConnectorChange={(value) => onUpdate({ chatConnectorId: value })}
              onModelChange={(value) => onUpdate({ chatModel: value })}
              modelListId="kb-chat-model-list"
            />
            <RoutePanel
              title="Embedding Route"
              source={settings.embeddingRouteSource}
              connectorId={settings.embeddingConnectorId}
              model={settings.embeddingModel}
              routeOptions={props.embeddingRouteOptions}
              onSourceChange={handleEmbeddingRouteSourceChange}
              onConnectorChange={(value) => onUpdate({ embeddingConnectorId: value })}
              onModelChange={(value) => onUpdate({ embeddingModel: value })}
              modelListId="kb-embedding-model-list"
            />
          </div>
          <p className="mt-3 text-[10px] text-gray-400">
            Changing the embedding route or embedding model does not re-embed existing documents. Re-import documents after an embedding route change.
          </p>
        </SettingsCard>
      </div>
    </div>
  );
}
