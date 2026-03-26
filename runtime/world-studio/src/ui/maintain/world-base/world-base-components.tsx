import React from 'react';

type WorldBasePanelBlockProps = {
  eyebrow: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
};

type WorldBaseFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  rows?: number;
  className?: string;
};

type WorldBaseReadonlyCodeProps = {
  value: string;
  emptyLabel: string;
  className?: string;
  heightClassName?: string;
};

type WorldBaseDetailsDisclosureProps = {
  summary: string;
  children: React.ReactNode;
  className?: string;
  defaultOpen?: boolean;
};

type WorldBaseStatChipProps = {
  label: string;
  value: string;
  tone?: 'neutral' | 'success' | 'warning';
};

const CHIP_TONE_CLASSES: Record<NonNullable<WorldBaseStatChipProps['tone']>, string> = {
  neutral: 'border-slate-200 bg-slate-50 text-slate-700',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
};

export function WorldBasePanelBlock(props: WorldBasePanelBlockProps) {
  return (
    <section className={`ui-sync-soft-card p-3 ${props.className || ''}`.trim()}>
      <div className="mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
          {props.eyebrow}
        </p>
        <h4 className="mt-1 text-sm font-semibold text-slate-900">{props.title}</h4>
        {props.description ? (
          <p className="mt-1 text-[11px] leading-5 text-slate-500">{props.description}</p>
        ) : null}
      </div>
      {props.children}
    </section>
  );
}

export function WorldBaseField(props: WorldBaseFieldProps) {
  const inputClassName = props.multiline
    ? 'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px] text-slate-700'
    : 'h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-[11px] text-slate-700';

  return (
    <label className={`block text-xs text-slate-700 ${props.className || ''}`.trim()}>
      <span className="mb-1 block font-medium text-slate-800">{props.label}</span>
      {props.multiline ? (
        <textarea
          className={inputClassName}
          rows={props.rows || 3}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
        />
      ) : (
        <input
          className={inputClassName}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
        />
      )}
    </label>
  );
}

export function WorldBaseReadonlyCode(props: WorldBaseReadonlyCodeProps) {
  if (!props.value) {
    return (
      <div className={`rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-[11px] text-slate-500 ${props.className || ''}`.trim()}>
        {props.emptyLabel}
      </div>
    );
  }

  return (
    <textarea
      className={`w-full rounded-lg border border-slate-200 bg-slate-50 p-2 font-mono text-[11px] text-slate-600 ${props.heightClassName || 'h-44'} ${props.className || ''}`.trim()}
      value={props.value}
      readOnly
    />
  );
}

export function WorldBaseDetailsDisclosure(props: WorldBaseDetailsDisclosureProps) {
  return (
    <details className={`ui-sync-code-panel rounded-xl border border-slate-200 bg-white p-3 ${props.className || ''}`.trim()} open={props.defaultOpen}>
      <summary className="cursor-pointer text-xs font-semibold text-slate-700">{props.summary}</summary>
      <div className="mt-2">{props.children}</div>
    </details>
  );
}

export function WorldBaseStatChip(props: WorldBaseStatChipProps) {
  const toneClassName = CHIP_TONE_CLASSES[props.tone || 'neutral'];
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] ${toneClassName}`.trim()}>
      <span className="text-slate-400">{props.label}</span>
      <span className="font-semibold text-slate-800">{props.value}</span>
    </div>
  );
}
