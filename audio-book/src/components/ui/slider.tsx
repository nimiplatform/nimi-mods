// ---------------------------------------------------------------------------
// Shared Slider component (Radix UI)
// ---------------------------------------------------------------------------

import React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';

type SliderProps = {
  label: string;
  value: number;
  onValueChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  formatValue?: (value: number) => string;
  className?: string;
};

export function Slider({ label, value, onValueChange, min, max, step, formatValue, className }: SliderProps) {
  const displayValue = formatValue ? formatValue(value) : String(value);

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-xs font-medium text-gray-600">{label}</label>
        <span className="text-[10px] font-medium text-gray-400">{displayValue}</span>
      </div>
      <SliderPrimitive.Root
        className="relative flex h-5 w-full touch-none items-center select-none"
        value={[value]}
        onValueChange={([v]) => { if (v !== undefined) onValueChange(v); }}
        min={min}
        max={max}
        step={step}
      >
        <SliderPrimitive.Track className="relative h-1.5 w-full grow rounded-full bg-gray-200">
          <SliderPrimitive.Range className="absolute h-full rounded-full bg-indigo-500" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full border-2 border-indigo-500 bg-white shadow-sm transition-colors hover:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
      </SliderPrimitive.Root>
    </div>
  );
}
