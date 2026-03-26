import React, { useEffect, useMemo, useState } from 'react';
import { useModTranslation } from "@nimiplatform/sdk/mod";
import { worldStudioMessage } from '../../i18n/messages.js';

type KeyValueObjectEditorProps = {
  label: string;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  compact?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isPrimitive(value: unknown): value is string | number | boolean | null | undefined {
  return value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
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
  if (path.length === 0) {
    return nextValue;
  }

  const [segment, ...rest] = path;
  const safeSegment = segment!;
  if (Array.isArray(root)) {
    const index = Number(safeSegment);
    const next = [...root];
    next[index] = rest.length === 0
      ? nextValue
      : setPathValue(next[index], rest, nextValue);
    return next;
  }

  const record = isRecord(root) ? root : {};
  const next = { ...record };
  next[safeSegment] = rest.length === 0
    ? nextValue
    : setPathValue(next[safeSegment], rest, nextValue);
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

function renameObjectKey(
  objectValue: Record<string, unknown>,
  fromKey: string,
  toKey: string,
): Record<string, unknown> {
  const nextEntries = Object.entries(objectValue).map(([key, value]) => {
    if (key !== fromKey) {
      return [key, value] as const;
    }
    return [toKey, value] as const;
  });
  return Object.fromEntries(
    nextEntries.filter(([key]) => String(key || '').trim().length > 0),
  );
}

function parsePrimitiveInput(value: string, currentValue: unknown): unknown {
  const trimmed = String(value || '').trim();
  if (typeof currentValue === 'boolean') {
    return trimmed === 'true';
  }
  if (typeof currentValue === 'number') {
    return Number(trimmed) || 0;
  }
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}'))
    || (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
  return value;
}

function summarizeStructuredValue(value: unknown): string {
  if (value == null) return worldStudioMessage('lorebooks.structure.empty', 'empty');
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!normalized) return worldStudioMessage('lorebooks.structure.emptyText', 'empty text');
    return normalized.length <= 56 ? normalized : `${normalized.slice(0, 56)}...`;
  }
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') {
    return value
      ? worldStudioMessage('lorebooks.structure.true', 'true')
      : worldStudioMessage('lorebooks.structure.false', 'false');
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return worldStudioMessage('lorebooks.structure.emptyList', 'empty list');
    return worldStudioMessage('lorebooks.structure.items', '{{count}} items', { count: value.length });
  }
  if (isRecord(value)) {
    const keys = Object.keys(value);
    if (keys.length === 0) return worldStudioMessage('lorebooks.structure.emptyObject', 'empty object');
    return worldStudioMessage('lorebooks.structure.fields', '{{count}} fields', { count: keys.length });
  }
  return worldStudioMessage('lorebooks.structure.value', 'value');
}

function pathLabel(segment: string): string {
  if (/^\d+$/.test(segment)) {
    return worldStudioMessage('lorebooks.structure.item', 'Item {{index}}', { index: Number(segment) + 1 });
  }
  return segment;
}

function toPrimitiveArrayText(value: unknown[]): string {
  return value.map((item) => String(item ?? '')).join('\n');
}

function fromPrimitiveArrayText(value: string): unknown[] {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => parsePrimitiveInput(item, item));
}

export function KeyValueObjectEditor(props: KeyValueObjectEditorProps) {
  const { t } = useModTranslation('world-studio');
  const [selectedPath, setSelectedPath] = useState<string[]>([]);

  const currentValue = useMemo(
    () => getPathValue(props.value || {}, selectedPath),
    [props.value, selectedPath],
  );

  useEffect(() => {
    if (selectedPath.length === 0) return;
    if (currentValue === undefined) {
      setSelectedPath([]);
    }
  }, [currentValue, selectedPath]);

  const updateRoot = (nextRoot: unknown) => {
    props.onChange(isRecord(nextRoot) ? nextRoot : {});
  };

  const updateAtPath = (path: string[], nextValue: unknown) => {
    updateRoot(setPathValue(props.value || {}, path, nextValue));
  };

  const deleteAtPath = (path: string[]) => {
    updateRoot(removePathValue(props.value || {}, path));
    if (selectedPath.length > 0 && path.join('.') === selectedPath.join('.')) {
      setSelectedPath(path.slice(0, -1));
    }
  };

  const compactClassName = props.compact ? 'text-[10px]' : 'text-[11px]';
  const actionClassName = 'inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600';
  const destructiveActionClassName = 'inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-rose-200 bg-white px-2 py-1 text-[10px] font-semibold text-rose-600';

  const renderPrimitiveEditor = (value: unknown, path: string[]): React.ReactElement => {
    if (typeof value === 'boolean') {
      return (
        <label className={`flex items-center gap-2 ${compactClassName} text-slate-700`}>
          <input
            type="checkbox"
            checked={value}
            onChange={(event) => updateAtPath(path, event.target.checked)}
          />
          <span>{pathLabel(path[path.length - 1] || props.label)}</span>
        </label>
      );
    }

    const textValue = value == null ? '' : String(value);
    const multiline = textValue.length > 60 || textValue.includes('\n');
    if (multiline) {
      return (
        <textarea
          className="h-28 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px] text-slate-700"
          value={textValue}
          onChange={(event) => updateAtPath(path, parsePrimitiveInput(event.target.value, value))}
        />
      );
    }
    return (
      <input
        className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-[11px] text-slate-700"
        value={textValue}
        onChange={(event) => updateAtPath(path, parsePrimitiveInput(event.target.value, value))}
      />
    );
  };

  const renderObjectEditor = (value: Record<string, unknown>, path: string[]): React.ReactElement => {
    const entries = Object.entries(value);
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-slate-500">
            {worldStudioMessage(
              'lorebooks.structure.objectHint',
              'Primitive fields edit inline. Nested objects and arrays can be inspected one level deeper.',
            )}
          </p>
          <button
            type="button"
            className={actionClassName}
            onClick={() => updateAtPath(path, {
              ...value,
              [`field_${entries.length + 1}`]: '',
            })}
          >
            {t('shared.addField')}
          </button>
        </div>

        {entries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-[11px] text-slate-500">
            {t('shared.noFieldsYet')}
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map(([fieldKey, fieldValue]) => {
              const fieldPath = [...path, fieldKey];
              const isNested = Array.isArray(fieldValue) || isRecord(fieldValue);
              return (
                <div key={fieldPath.join('.')} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2.5">
                  <div className="grid gap-2 lg:grid-cols-[180px_minmax(0,1fr)_auto]">
                    <input
                      className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-[11px] text-slate-700"
                      value={fieldKey}
                      onChange={(event) => updateAtPath(path, renameObjectKey(value, fieldKey, event.target.value))}
                      placeholder={t('shared.keyPlaceholder')}
                    />

                    {isNested ? (
                      <div className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-600">
                        <p className="truncate font-medium text-slate-800">{summarizeStructuredValue(fieldValue)}</p>
                        <p className="mt-1 truncate text-[10px] text-slate-500">
                          {worldStudioMessage('lorebooks.structure.nestedHint', 'Open this field to continue inspecting deeper structure.')}
                        </p>
                      </div>
                    ) : (
                      renderPrimitiveEditor(fieldValue, fieldPath)
                    )}

                    <div className="flex shrink-0 items-start justify-end gap-2">
                      {isNested ? (
                        <button
                          type="button"
                          className={actionClassName}
                          onClick={() => setSelectedPath(fieldPath)}
                        >
                          {t('shared.inspect')}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className={destructiveActionClassName}
                        onClick={() => deleteAtPath(fieldPath)}
                      >
                        {t('shared.deleteShort')}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderArrayEditor = (value: unknown[], path: string[]): React.ReactElement => {
    const primitiveArray = value.every((item) => isPrimitive(item));
    if (primitiveArray) {
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-slate-500">
              {worldStudioMessage('lorebooks.structure.arrayHint', 'One primitive item per line.')}
            </p>
            <button
              type="button"
              className={actionClassName}
              onClick={() => updateAtPath(path, [...value, ''])}
            >
              {worldStudioMessage('lorebooks.structure.addItem', 'Add item')}
            </button>
          </div>
          <textarea
            className="h-28 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 font-mono text-[11px] text-slate-700"
            value={toPrimitiveArrayText(value)}
            onChange={(event) => updateAtPath(path, fromPrimitiveArrayText(event.target.value))}
          />
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-slate-500">
            {worldStudioMessage('lorebooks.structure.arrayNestedHint', 'Nested array items can be inspected and edited one level deeper.')}
          </p>
          <button
            type="button"
            className={actionClassName}
            onClick={() => updateAtPath(path, [...value, {}])}
          >
            {worldStudioMessage('lorebooks.structure.addItem', 'Add item')}
          </button>
        </div>
        <div className="space-y-2">
          {value.map((item, index) => {
            const itemPath = [...path, String(index)];
            return (
              <div key={itemPath.join('.')} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-medium text-slate-800">{pathLabel(String(index))}</p>
                  <p className="truncate text-[10px] text-slate-500">{summarizeStructuredValue(item)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    className={actionClassName}
                    onClick={() => setSelectedPath(itemPath)}
                  >
                    {t('shared.inspect')}
                  </button>
                  <button
                    type="button"
                    className={destructiveActionClassName}
                    onClick={() => deleteAtPath(itemPath)}
                  >
                    {t('shared.deleteShort')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderCurrentValue = (): React.ReactElement => {
    if (Array.isArray(currentValue)) {
      return renderArrayEditor(currentValue, selectedPath);
    }
    if (isRecord(currentValue)) {
      return renderObjectEditor(currentValue, selectedPath);
    }
    return renderPrimitiveEditor(currentValue, selectedPath);
  };

  const breadcrumbItems = [
    props.label,
    ...selectedPath.map((segment) => pathLabel(segment)),
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="text-xs font-medium text-gray-700">{props.label}</span>
          <p className="mt-1 text-[11px] text-slate-500">
            {selectedPath.length === 0
              ? worldStudioMessage('lorebooks.structure.rootHint', 'Inspect top-level fields here. Nested objects can continue one level deeper.')
              : worldStudioMessage('lorebooks.structure.pathHint', 'Currently editing {{value}}.', {
                value: breadcrumbItems.join(' / '),
              })}
          </p>
        </div>
        {selectedPath.length > 0 ? (
          <button
            type="button"
            className={actionClassName}
            onClick={() => setSelectedPath(selectedPath.slice(0, -1))}
          >
            {worldStudioMessage('worldview.focus.backOneLevel', 'Back One Level')}
          </button>
        ) : null}
      </div>

      {selectedPath.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className="inline-flex items-center justify-center whitespace-nowrap rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600"
            onClick={() => setSelectedPath([])}
          >
            {props.label}
          </button>
          {selectedPath.map((segment, index) => (
            <button
              key={`${segment}:${index}`}
              type="button"
              className="inline-flex items-center justify-center whitespace-nowrap rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600"
              onClick={() => setSelectedPath(selectedPath.slice(0, index + 1))}
            >
              {pathLabel(segment)}
            </button>
          ))}
        </div>
      ) : null}

      {renderCurrentValue()}
    </div>
  );
}
