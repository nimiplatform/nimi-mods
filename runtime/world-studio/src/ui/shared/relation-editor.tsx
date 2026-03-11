import React from 'react';

type RelationEditorProps = {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
};

function normalizeList(value: string[]): string[] {
  return [...new Set(value.map((item) => String(item || '').trim()).filter((item) => Boolean(item)))];
}

export function RelationEditor(props: RelationEditorProps) {
  const text = props.value.join(', ');
  return (
    <label className="block text-xs text-gray-700">
      <span className="mb-1 block font-medium text-gray-700">{props.label}</span>
      <input
        className="h-9 w-full rounded-md border border-gray-300 px-2 text-xs text-gray-900"
        value={text}
        placeholder={props.placeholder || 'Comma separated'}
        onChange={(event) => {
          const next = normalizeList(event.target.value.split(','));
          props.onChange(next);
        }}
      />
    </label>
  );
}
