import React, { useEffect, useMemo, useState } from 'react';
import { useModTranslation } from "@nimiplatform/sdk/mod";
import { worldStudioMessage } from '../../i18n/messages.js';

type WorldviewPanelProps = {
  worldviewPatch: Record<string, unknown>;
  onWorldviewPatchChange: (value: Record<string, unknown>) => void;
};

type EditorMode = 'overview' | 'inspect' | 'focus';
type EditorTab = 'fields' | 'raw';

type ModuleDefinition = {
  key: string;
  required?: boolean;
  title: string;
  description: string;
};

type ChildEntry = {
  key: string;
  label: string;
  path: string[];
  kind: 'primitive' | 'object' | 'array';
  value: unknown;
  summary: string;
};

const MODULE_DEFINITIONS: ModuleDefinition[] = [
  { key: 'timeModel', required: true, title: 'timeModel', description: 'Calendars, ratio, anchors, and temporal rules.' },
  { key: 'lifecycle', title: 'lifecycle', description: 'Cycles, state changes, and life progression.' },
  { key: 'coreSystem', required: true, title: 'coreSystem', description: 'Rules, systems, constraints, and shared mechanics.' },
  { key: 'causality', required: true, title: 'causality', description: 'What drives change and how consequences propagate.' },
  { key: 'languages', title: 'languages', description: 'Shared language truth for the world and its actors.' },
  { key: 'existences', title: 'existences', description: 'Who and what kinds of beings can exist here.' },
  { key: 'resources', title: 'resources', description: 'Scarcity, production, and resource flow.' },
  { key: 'spaceTopology', required: true, title: 'spaceTopology', description: 'Places, boundaries, travel, and world layout.' },
  { key: 'structures', title: 'structures', description: 'Organizations, social order, and world scaffolding.' },
  { key: 'visualGuide', title: 'visualGuide', description: 'Visual motifs and descriptive style anchors.' },
  { key: 'narrativeHooks', title: 'narrativeHooks', description: 'Plot hooks, tensions, and story-facing affordances.' },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isPrimitive(value: unknown): value is string | number | boolean | null | undefined {
  return value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function updateWorldview(raw: Record<string, unknown>, patch: (next: Record<string, unknown>) => void): Record<string, unknown> {
  const next = { ...(raw || {}) };
  patch(next);
  return next;
}

function getPathValue(root: unknown, path: string[]): unknown {
  let current = root;
  for (const segment of path) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index)) return undefined;
      current = current[index];
      continue;
    }
    if (isRecord(current)) {
      current = current[segment];
      continue;
    }
    return undefined;
  }
  return current;
}

function setPathValue(root: unknown, path: string[], nextValue: unknown): unknown {
  if (path.length === 0) return nextValue;
  const [segment, ...rest] = path;
  const safeSegment = segment!;
  if (Array.isArray(root)) {
    const index = Number(safeSegment);
    const next = [...root];
    next[index] = rest.length === 0 ? nextValue : setPathValue(next[index], rest, nextValue);
    return next;
  }
  const record = isRecord(root) ? root : {};
  const next = { ...record };
  next[safeSegment] = rest.length === 0 ? nextValue : setPathValue(next[safeSegment], rest, nextValue);
  return next;
}

function removePathValue(root: unknown, path: string[]): unknown {
  if (path.length === 0) return root;
  const [segment, ...rest] = path;
  const safeSegment = segment!;
  if (Array.isArray(root)) {
    const index = Number(safeSegment);
    if (!Number.isInteger(index)) return root;
    const next = [...root];
    if (rest.length === 0) {
      next.splice(index, 1);
      return next;
    }
    next[index] = removePathValue(next[index], rest);
    return next;
  }
  if (!isRecord(root)) return root;
  const next = { ...root };
  if (rest.length === 0) {
    delete next[safeSegment];
    return next;
  }
  next[safeSegment] = removePathValue(next[safeSegment], rest);
  return next;
}

function toPathLabel(segment: string): string {
  const moduleDefinition = getModuleDefinition(segment);
  if (moduleDefinition) return getModuleTitle(moduleDefinition);
  if (/^\d+$/.test(segment)) {
    return worldStudioMessage('worldview.shared.itemLabel', 'Item {{index}}', { index: Number(segment) + 1 });
  }
  return segment;
}

function toEntryLabel(key: string, value: unknown, index?: number): string {
  if (index != null) {
    if (isRecord(value)) {
      const preferred = [value.title, value.name, value.key, value.id]
        .map((item) => String(item || '').trim())
        .find(Boolean);
      return preferred
        ? `${index + 1}. ${preferred}`
        : worldStudioMessage('worldview.shared.itemLabel', 'Item {{index}}', { index: index + 1 });
    }
    return worldStudioMessage('worldview.shared.itemLabel', 'Item {{index}}', { index: index + 1 });
  }
  return key;
}

function summarizeValue(value: unknown): string {
  if (value == null) return worldStudioMessage('worldview.summary.empty', 'empty');
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!normalized) return worldStudioMessage('worldview.summary.emptyText', 'empty text');
    if (normalized.length <= 42) return normalized;
    return `${normalized.slice(0, 42)}...`;
  }
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') {
    return value
      ? worldStudioMessage('worldview.summary.booleanTrue', 'true')
      : worldStudioMessage('worldview.summary.booleanFalse', 'false');
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return worldStudioMessage('worldview.summary.emptyList', 'empty list');
    if (value.every((item) => isPrimitive(item))) {
      return worldStudioMessage('worldview.summary.itemList', '{{count}} item list', { count: value.length });
    }
    return worldStudioMessage('worldview.summary.nestedItems', '{{count}} nested items', { count: value.length });
  }
  if (isRecord(value)) {
    const keys = Object.keys(value);
    if (keys.length === 0) return worldStudioMessage('worldview.summary.emptyObject', 'empty object');
    return worldStudioMessage('worldview.summary.fields', '{{count}} fields', { count: keys.length });
  }
  return worldStudioMessage('worldview.summary.value', 'value');
}

function countDirectFields(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (isRecord(value)) return Object.keys(value).length;
  return isPrimitive(value) && value != null ? 1 : 0;
}

function countNestedEntries(value: unknown): number {
  if (Array.isArray(value)) return value.filter((item) => Array.isArray(item) || isRecord(item)).length;
  if (isRecord(value)) return Object.values(value).filter((item) => Array.isArray(item) || isRecord(item)).length;
  return 0;
}

function collectChildEntries(value: unknown, basePath: string[]): ChildEntry[] {
  if (Array.isArray(value)) {
    return value.map((item, index) => ({
      key: String(index),
      label: toEntryLabel(String(index), item, index),
      path: [...basePath, String(index)],
      kind: Array.isArray(item) ? 'array' : isRecord(item) ? 'object' : 'primitive',
      value: item,
      summary: summarizeValue(item),
    }));
  }
  if (isRecord(value)) {
    return Object.entries(value).map(([key, child]) => ({
      key,
      label: key,
      path: [...basePath, key],
      kind: Array.isArray(child) ? 'array' : isRecord(child) ? 'object' : 'primitive',
      value: child,
      summary: summarizeValue(child),
    }));
  }
  return [];
}

function toPrimitiveArrayText(value: unknown[]): string {
  return value.map((item) => item == null ? '' : String(item)).join('\n');
}

function fromPrimitiveArrayText(raw: string): string[] {
  return raw.split('\n').map((line) => line.trim()).filter(Boolean);
}

function getModuleDefinition(key: string): ModuleDefinition | null {
  return MODULE_DEFINITIONS.find((item) => item.key === key) || null;
}

function previewKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.slice(0, 3).map((_, index) => worldStudioMessage('worldview.preview.item', 'item {{index}}', { index: index + 1 }));
  if (isRecord(value)) return Object.keys(value).slice(0, 4);
  return [];
}

function getModuleTitle(moduleDefinition: ModuleDefinition): string {
  return worldStudioMessage(`worldview.modules.${moduleDefinition.key}.title`, moduleDefinition.title);
}

function getModuleDescription(moduleDefinition: ModuleDefinition): string {
  return worldStudioMessage(`worldview.modules.${moduleDefinition.key}.description`, moduleDefinition.description);
}

function getEntryKindLabel(kind: ChildEntry['kind']): string {
  return worldStudioMessage(`worldview.kind.${kind}`, kind);
}

export function WorldviewPanel(props: WorldviewPanelProps) {
  const { t } = useModTranslation('world-studio');
  const worldview = props.worldviewPatch || {};
  const worldviewPatchText = JSON.stringify(worldview, null, 2);

  const moduleDefinitions = useMemo(() => MODULE_DEFINITIONS, []);
  const availableModules = useMemo(
    () => moduleDefinitions.filter((moduleDefinition) => worldview[moduleDefinition.key] !== undefined || moduleDefinition.required),
    [moduleDefinitions, worldview],
  );

  const firstModuleKey = availableModules[0]?.key || moduleDefinitions[0]?.key || 'coreSystem';
  const [mode, setMode] = useState<EditorMode>('overview');
  const [selectedPath, setSelectedPath] = useState<string[]>([firstModuleKey]);
  const [inspectTab, setInspectTab] = useState<EditorTab>('fields');
  const [focusTab, setFocusTab] = useState<EditorTab>('fields');

  useEffect(() => {
    const currentModuleKey = selectedPath[0];
    const hasCurrentModule = availableModules.some((item) => item.key === currentModuleKey);
    if (!hasCurrentModule) {
      setSelectedPath([firstModuleKey]);
    }
  }, [availableModules, firstModuleKey, selectedPath]);

  const selectedModuleKey = selectedPath[0] || firstModuleKey;
  const selectedModuleDefinition = getModuleDefinition(selectedModuleKey);
  const selectedValue = getPathValue(worldview, selectedPath);

  const requiredModules = moduleDefinitions.filter((item) => item.required).map((item) => item.key);
  const missingModules = requiredModules.filter((moduleKey) => {
    const value = worldview[moduleKey];
    return !isRecord(value) || Object.keys(value).length === 0;
  });
  const missingModuleLabels = missingModules.map((moduleKey) => {
    const moduleDefinition = getModuleDefinition(moduleKey);
    return moduleDefinition ? getModuleTitle(moduleDefinition) : moduleKey;
  });

  function patchWorldview(nextValue: unknown, path: string[]) {
    props.onWorldviewPatchChange(updateWorldview(worldview, (draft) => {
      const nextRoot = setPathValue(draft, path, nextValue);
      Object.keys(draft).forEach((key) => delete draft[key]);
      Object.assign(draft, isRecord(nextRoot) ? nextRoot : {});
    }));
  }

  function deleteAtPath(path: string[]) {
    props.onWorldviewPatchChange(updateWorldview(worldview, (draft) => {
      const nextRoot = removePathValue(draft, path);
      Object.keys(draft).forEach((key) => delete draft[key]);
      Object.assign(draft, isRecord(nextRoot) ? nextRoot : {});
    }));
  }

  function openModule(moduleKey: string, nextMode: EditorMode) {
    setSelectedPath([moduleKey]);
    setMode(nextMode);
    setInspectTab('fields');
    setFocusTab('fields');
  }

  function updateFieldAtPath(path: string[], currentValue: unknown, nextRawValue: string) {
    if (typeof currentValue === 'number') {
      patchWorldview(Number(nextRawValue) || 0, path);
      return;
    }
    patchWorldview(nextRawValue, path);
  }

  function renderPrimitiveEditor(label: string, value: unknown, path: string[], compact = false): React.ReactElement {
    if (typeof value === 'boolean') {
      return (
        <label className="flex items-center gap-2 text-[11px] text-slate-700">
          <input type="checkbox" checked={value} onChange={(event) => patchWorldview(event.target.checked, path)} />
          <span>{label}</span>
        </label>
      );
    }

    const textValue = value == null ? '' : String(value);
    const preferTextarea = textValue.length > 60 || textValue.includes('\n') || /description|summary|overview|value/i.test(label);
    if (preferTextarea) {
      return (
        <label className="block text-[11px] text-slate-700">
          <span className="mb-1 block font-medium text-slate-800">{label}</span>
          <textarea
            className={`${compact ? 'h-20' : 'h-28'} w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px] text-slate-700`}
            value={textValue}
            onChange={(event) => updateFieldAtPath(path, value, event.target.value)}
          />
        </label>
      );
    }

    return (
      <label className="block text-[11px] text-slate-700">
        <span className="mb-1 block font-medium text-slate-800">{label}</span>
        <input
          className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-[11px] text-slate-700"
          value={textValue}
          onChange={(event) => updateFieldAtPath(path, value, event.target.value)}
        />
      </label>
    );
  }

  function renderArrayEditor(value: unknown[], path: string[], compact = false): React.ReactElement {
    const primitiveArray = value.every((item) => isPrimitive(item));
    if (primitiveArray) {
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-800">{worldStudioMessage('worldview.editor.arrayItems', 'Array items')}</span>
            <button type="button" className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600" onClick={() => patchWorldview([...(value || []), ''], path)}>
              {worldStudioMessage('shared.addField', 'Add field')}
            </button>
          </div>
          <textarea
            className={`${compact ? 'h-20' : 'h-28'} w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 font-mono text-[11px] text-slate-700`}
            value={toPrimitiveArrayText(value)}
            onChange={(event) => patchWorldview(fromPrimitiveArrayText(event.target.value), path)}
          />
          <p className="text-[10px] text-slate-500">{worldStudioMessage('worldview.editor.arrayHint', 'One item per line.')}</p>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-slate-800">{worldStudioMessage('worldview.editor.nestedItems', 'Nested items')}</span>
          <button type="button" className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600" onClick={() => patchWorldview([...(value || []), {}], path)}>
            {worldStudioMessage('worldview.editor.addItem', 'Add item')}
          </button>
        </div>
        <div className="space-y-1.5">
          {value.map((item, index) => (
            <div key={`${path.join('.')}:${index}`} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
              <div className="min-w-0">
                <p className="truncate text-[11px] font-medium text-slate-800">{toEntryLabel(String(index), item, index)}</p>
                <p className="truncate text-[10px] text-slate-500">{summarizeValue(item)}</p>
              </div>
              <div className="ml-3 flex items-center gap-1.5">
                <button type="button" className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600" onClick={() => setSelectedPath([...path, String(index)])}>
                  {worldStudioMessage('worldview.editor.inspect', 'Inspect')}
                </button>
                <button type="button" className="rounded-md border border-rose-200 bg-white px-2 py-1 text-[10px] font-semibold text-rose-600" onClick={() => deleteAtPath([...path, String(index)])}>
                  {worldStudioMessage('shared.deleteShort', 'Del')}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderObjectEditor(value: Record<string, unknown>, path: string[], compact = false): React.ReactElement {
    const entries = Object.entries(value);
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-slate-800">{worldStudioMessage('worldview.editor.objectFields', 'Object fields')}</p>
            <p className="text-[10px] text-slate-500">{worldStudioMessage('worldview.editor.objectHint', 'Primitive fields edit inline. Nested fields can be inspected one level deeper.')}</p>
          </div>
          <button
            type="button"
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600"
            onClick={() => patchWorldview({
              ...value,
              [`field_${entries.length + 1}`]: '',
            }, path)}
          >
            {worldStudioMessage('shared.addField', 'Add field')}
          </button>
        </div>
        <div className="space-y-2">
          {entries.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-[11px] text-slate-500">
              {worldStudioMessage('shared.noFieldsYet', 'No fields yet')}
            </div>
          ) : entries.map(([fieldKey, fieldValue]) => {
            const fieldPath = [...path, fieldKey];
            if (isPrimitive(fieldValue)) {
              return (
                <div key={fieldPath.join('.')} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2.5">
                  {renderPrimitiveEditor(fieldKey, fieldValue, fieldPath, compact)}
                </div>
              );
            }

            const fieldKind = Array.isArray(fieldValue) ? 'array' : 'object';
            return (
              <div key={fieldPath.join('.')} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-medium text-slate-800">{fieldKey}</p>
                    <p className="truncate text-[10px] text-slate-500">{summarizeValue(fieldValue)}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button type="button" className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600" onClick={() => setSelectedPath(fieldPath)}>
                      {fieldKind === 'array'
                        ? worldStudioMessage('worldview.editor.openItems', 'Open items')
                        : worldStudioMessage('worldview.editor.inspect', 'Inspect')}
                    </button>
                    <button type="button" className="rounded-md border border-rose-200 bg-white px-2 py-1 text-[10px] font-semibold text-rose-600" onClick={() => deleteAtPath(fieldPath)}>
                      {worldStudioMessage('shared.deleteShort', 'Del')}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderEditorForValue(value: unknown, path: string[], compact = false): React.ReactElement {
    if (Array.isArray(value)) return renderArrayEditor(value, path, compact);
    if (isRecord(value)) return renderObjectEditor(value, path, compact);
    return renderPrimitiveEditor(toPathLabel(path[path.length - 1] || 'value'), value, path, compact);
  }

  function renderModuleCard(moduleDefinition: ModuleDefinition): React.ReactElement {
    const value = worldview[moduleDefinition.key];
    const ready = isRecord(value) && Object.keys(value).length > 0;
    const fields = countDirectFields(value);
    const nested = countNestedEntries(value);
    const previews = previewKeys(value);
    return (
      <button
        key={moduleDefinition.key}
        type="button"
        className={`rounded-xl border px-3 py-3 text-left transition-colors ${
          selectedModuleKey === moduleDefinition.key && mode !== 'focus'
            ? 'border-teal-300 bg-[#ecfaf6] shadow-[0_8px_24px_rgba(20,184,166,0.10)]'
            : ready
              ? 'border-slate-200 bg-white hover:border-slate-300'
              : 'border-amber-200 bg-amber-50/70 hover:border-amber-300'
        }`}
        onClick={() => openModule(moduleDefinition.key, 'inspect')}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[12px] font-semibold text-slate-900">{getModuleTitle(moduleDefinition)}</p>
            <p className="mt-1 line-clamp-2 text-[10px] text-slate-500">{getModuleDescription(moduleDefinition)}</p>
          </div>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            ready ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-100 text-amber-700'
          }`}>
            {ready ? worldStudioMessage('worldview.card.ready', 'ready') : worldStudioMessage('worldview.card.missing', 'thin')}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] text-slate-500">
          <span className="rounded-full bg-slate-100 px-2 py-0.5">{worldStudioMessage('worldview.card.fields', '{{count}} fields', { count: fields })}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5">{worldStudioMessage('worldview.card.nested', '{{count}} nested', { count: nested })}</span>
        </div>
        {previews.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-slate-500">
            {previews.map((preview) => (
              <span key={`${moduleDefinition.key}:${preview}`} className="rounded-full bg-[#eef5f5] px-2 py-0.5">
                {preview}
              </span>
            ))}
          </div>
        ) : null}
      </button>
    );
  }

  function renderOverview(): React.ReactElement {
    return (
      <div className="mt-3 rounded-xl border border-white/80 bg-white/92 p-3 shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {availableModules.map(renderModuleCard)}
        </div>
      </div>
    );
  }

  function renderInspectDrawer(): React.ReactElement | null {
    if (mode !== 'inspect') return null;
    const currentEntries = collectChildEntries(selectedValue, selectedPath);
    const pathLabel = selectedPath.map(toPathLabel).join(' / ');
    return (
      <>
        <button
          type="button"
          aria-label={worldStudioMessage('worldview.drawer.closeOverlay', 'Close worldview drawer')}
          className="absolute inset-0 z-20 rounded-[28px] bg-slate-900/8"
          onClick={() => setMode('overview')}
        />
        <aside className="absolute inset-y-0 right-0 z-30 flex w-[380px] max-w-[92vw] flex-col border-l border-white/80 bg-[#f8fbfb] shadow-[-10px_0_24px_rgba(15,23,42,0.10)]">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                {worldStudioMessage('worldview.drawer.label', 'Inspect')}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{pathLabel}</p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              {currentEntries.length > 0 ? (
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-slate-900 bg-slate-900 px-2.5 py-1 text-[10px] font-semibold text-white"
                  onClick={() => setMode('focus')}
                >
                  {worldStudioMessage('worldview.drawer.openFocus', 'Open Focus Editor')}
                </button>
              ) : null}
              <button
                type="button"
                className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600"
                onClick={() => setMode('overview')}
              >
                {worldStudioMessage('shared.close', 'Close')}
              </button>
            </div>
          </div>
          <div className="border-b border-slate-200 px-4 py-2">
            <div className="flex gap-2">
              <button type="button" className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${inspectTab === 'fields' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600'}`} onClick={() => setInspectTab('fields')}>
                {worldStudioMessage('worldview.tabs.fields', 'Fields')}
              </button>
              <button type="button" className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${inspectTab === 'raw' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600'}`} onClick={() => setInspectTab('raw')}>
                {worldStudioMessage('worldview.tabs.raw', 'Raw')}
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {inspectTab === 'raw' ? (
              <textarea className="h-[420px] w-full rounded-lg border border-slate-200 bg-slate-50 p-2 font-mono text-[11px] text-slate-600" value={JSON.stringify(selectedValue ?? {}, null, 2)} readOnly />
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-[11px] font-medium text-slate-800">
                    {selectedModuleDefinition
                      ? getModuleDescription(selectedModuleDefinition)
                      : worldStudioMessage('worldview.drawer.defaultDescription', 'Inspect this slice before deciding whether it needs a deeper editor.')}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-slate-500">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5">
                      {worldStudioMessage('worldview.card.fields', '{{count}} fields', { count: countDirectFields(selectedValue) })}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5">
                      {worldStudioMessage('worldview.card.nested', '{{count}} nested', { count: countNestedEntries(selectedValue) })}
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  {renderEditorForValue(selectedValue, selectedPath, true)}
                </div>

                {currentEntries.length > 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[11px] font-medium text-slate-800">{worldStudioMessage('worldview.drawer.nextLayer', 'Deeper items')}</p>
                    </div>
                    <div className="space-y-1.5">
                      {currentEntries.map((entry) => (
                        <button
                          key={entry.path.join('.')}
                          type="button"
                          className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-left"
                          onClick={() => {
                            setSelectedPath(entry.path);
                            setMode('focus');
                          }}
                        >
                          <div className="min-w-0">
                            <p className="truncate text-[11px] font-medium text-slate-800">{entry.label}</p>
                            <p className="truncate text-[10px] text-slate-500">{entry.summary}</p>
                          </div>
                          <span className="ml-3 text-[10px] font-semibold text-slate-500">{getEntryKindLabel(entry.kind)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </aside>
      </>
    );
  }

  function renderFocusEditor(): React.ReactElement {
    const pathLabel = selectedPath.map(toPathLabel).join(' / ');
    return (
      <div className="mt-3 space-y-3">
        <section className="rounded-xl border border-white/80 bg-white/92 p-3 shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                {worldStudioMessage('worldview.focus.label', 'Focused Editor')}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{pathLabel}</p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-slate-500">
                {selectedPath.map((segment, index) => (
                  <button
                    key={`${segment}:${index}`}
                    type="button"
                    className="inline-flex items-center justify-center whitespace-nowrap rounded-full border border-slate-200 bg-white px-2 py-0.5 font-semibold"
                    onClick={() => setSelectedPath(selectedPath.slice(0, index + 1))}
                  >
                    {toPathLabel(segment)}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedPath.length > 1 ? (
                <button type="button" className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600" onClick={() => setSelectedPath(selectedPath.slice(0, -1))}>
                  {worldStudioMessage('worldview.focus.backOneLevel', 'Back One Level')}
                </button>
              ) : null}
              <button type="button" className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600" onClick={() => setMode('inspect')}>
                {worldStudioMessage('worldview.focus.backToInspect', 'Back to Inspect')}
              </button>
              <button type="button" className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600" onClick={() => setMode('overview')}>
                {worldStudioMessage('worldview.focus.backToOverview', 'Back to Overview')}
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-3 xl:grid-cols-[240px_minmax(0,1fr)]">
          <div className="rounded-xl border border-white/80 bg-white/92 p-3 shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              {worldStudioMessage('worldview.focus.moduleLabel', 'Modules')}
            </p>
            <div className="mt-2 space-y-1.5">
              {availableModules.map((moduleDefinition) => (
                <button
                  key={moduleDefinition.key}
                  type="button"
                  className={`w-full rounded-lg px-2.5 py-2 text-left text-[11px] font-medium ${
                    moduleDefinition.key === selectedModuleKey
                      ? 'bg-[#ecfaf6] text-slate-900'
                      : 'bg-slate-50 text-slate-600'
                  }`}
                  onClick={() => setSelectedPath([moduleDefinition.key])}
                >
                  {getModuleTitle(moduleDefinition)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-white/80 bg-white/92 p-3 shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
              <div className="flex items-center gap-2">
                <button type="button" className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${focusTab === 'fields' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600'}`} onClick={() => setFocusTab('fields')}>
                  {worldStudioMessage('worldview.tabs.fields', 'Fields')}
                </button>
                <button type="button" className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${focusTab === 'raw' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600'}`} onClick={() => setFocusTab('raw')}>
                  {worldStudioMessage('worldview.tabs.raw', 'Raw')}
                </button>
              </div>

              <div className="mt-3">
                {focusTab === 'raw' ? (
                  <textarea className="h-[420px] w-full rounded-lg border border-slate-200 bg-slate-50 p-2 font-mono text-[11px] text-slate-600" value={JSON.stringify(selectedValue ?? {}, null, 2)} readOnly />
                ) : renderEditorForValue(selectedValue, selectedPath, false)}
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <section className="relative rounded-[24px] border border-white/80 bg-white/88 p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
      <div className="pr-20">
        <h3 className="text-sm font-semibold text-gray-900">{t('worldview.title')}</h3>
        <p className="mt-1 text-xs text-gray-500">
          {t('worldview.explainer')}
        </p>
      </div>
      <div className="absolute right-4 top-4 flex items-center gap-2">
        {mode === 'focus' ? (
          <span className="rounded-full border border-slate-200 bg-slate-900 px-2.5 py-1 text-[10px] font-semibold text-white">
            {worldStudioMessage('worldview.mode.focus', 'Focus edit')}
          </span>
        ) : mode === 'inspect' ? (
          <span className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-[10px] font-semibold text-teal-700">
            {worldStudioMessage('worldview.mode.inspect', 'Inspect drawer')}
          </span>
        ) : (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
            {worldStudioMessage('worldview.mode.overview', 'Overview')}
          </span>
        )}
      </div>

      {missingModules.length > 0 ? (
        <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-800">
          {t('worldview.missingModules', { modules: missingModuleLabels.join('、') })}
        </div>
      ) : (
        <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-xs text-emerald-800">
          {t('worldview.ready')}
        </div>
      )}

      <div className="mt-3 rounded-xl border border-slate-200 bg-[#f7fbfb] px-3 py-2 text-[11px] text-slate-600">
        {worldStudioMessage(
          'worldview.patternHint',
          'Pattern: overview chooses the current layer, inspect drawer handles quick checks, and focus editor handles deep structure edits.',
        )}
      </div>

      {mode === 'focus' ? renderFocusEditor() : renderOverview()}
      {renderInspectDrawer()}

      <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
        <summary className="cursor-pointer text-xs font-semibold text-gray-700">{t('shared.rawJsonDebug')}</summary>
        <textarea className="mt-2 h-44 w-full rounded-md border border-gray-300 bg-white p-2 font-mono text-xs text-gray-600" value={worldviewPatchText} readOnly />
      </details>
    </section>
  );
}
