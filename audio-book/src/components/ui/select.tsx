// ---------------------------------------------------------------------------
// Shared Select component (Radix UI)
// ---------------------------------------------------------------------------

import React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';

type SelectOption = {
  value: string;
  label: string;
  description?: string;
};

type SelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

export function Select({ value, onValueChange, options, placeholder, disabled, className }: SelectProps) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        className={`inline-flex w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors hover:border-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 ${className ?? ''}`}
      >
        <SelectPrimitive.Value placeholder={placeholder ?? 'Select...'} />
        <SelectPrimitive.Icon className="ml-2 text-gray-400">
          <ChevronDown />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className="z-50 max-h-60 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
          position="popper"
          sideOffset={4}
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((opt) => (
              <SelectPrimitive.Item
                key={opt.value}
                value={opt.value}
                className="flex cursor-pointer items-center rounded-md px-2.5 py-1.5 text-sm text-gray-700 outline-none data-[highlighted]:bg-indigo-50 data-[highlighted]:text-indigo-900 data-[state=checked]:font-medium"
              >
                <SelectPrimitive.ItemText>
                  {opt.label}
                  {opt.description && (
                    <span className="ml-1.5 text-xs text-gray-400">{opt.description}</span>
                  )}
                </SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

function ChevronDown() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 4.5L6 7.5L9 4.5" />
    </svg>
  );
}
