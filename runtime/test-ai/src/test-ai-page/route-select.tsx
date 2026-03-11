import React from 'react';
import { useTestAiLocale } from './core.js';

export type RouteSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export function RouteSelect(props: {
  value: string;
  options: RouteSelectOption[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const locale = useTestAiLocale();
  const { value, options, disabled = false, onChange } = props;
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value) || options[0] || null;

  React.useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between rounded-[18px] border border-gray-200 bg-white px-4 py-3 text-left text-gray-900 transition hover:border-gray-300 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
      >
        <span className="truncate">{selected?.label || locale.route.selectModel}</span>
        <svg
          className={`ml-3 h-4 w-4 shrink-0 text-gray-700 transition ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-40 overflow-hidden rounded-[20px] border border-gray-200 bg-white shadow-[0_20px_40px_rgba(15,23,42,0.14)]">
          <div className="max-h-64 overflow-y-auto p-1.5">
            {options.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={`${option.value}-${option.label}`}
                  type="button"
                  disabled={option.disabled}
                  onClick={() => {
                    if (option.disabled) return;
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={
                    active
                      ? 'flex w-full items-center justify-between rounded-[14px] bg-[#4ECCA3]/14 px-3 py-2.5 text-left text-sm text-[#2E8D73]'
                      : 'flex w-full items-center justify-between rounded-[14px] px-3 py-2.5 text-left text-sm text-gray-800 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300'
                  }
                >
                  <span className="truncate">{option.label}</span>
                  <span className={active ? 'text-[#2E8D73]' : 'text-transparent'}>✓</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
